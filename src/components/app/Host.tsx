"use client";

import { Check, Clock, Copy, Share2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatMoney, type Currency } from "@/core/money";
import { LIVE, Ring, STATUS, timeLeft } from "@/components/app/Participant";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useConfirm } from "@/components/ui/Confirm";
import { useToast } from "@/components/ui/Toaster";
import { hostHeaders } from "@/lib/auth-client";

interface HostView {
  role: "host" | "participant";
  status: string;
  merchant: string | null;
  currency: Currency;
  deadlineAt: string | null;
  grandTotalCents: number | null;
  progress: { done: number; total: number } | null;
  participants: { id: string; name: string; isHost: boolean; paymentStatus: string; shareCents: number | null }[];
  items: { id: string; name: string; lineTotalCents: number; takenBy: string[] }[];
}
type Load = { kind: "loading" } | { kind: "invalid" } | { kind: "error" } | { kind: "ok"; room: HostView };

const DEADLINES = [
  { value: "6", label: "6 hours" },
  { value: "24", label: "24 hours", hint: "Recommended" },
  { value: "48", label: "48 hours" },
  { value: "72", label: "72 hours", hint: "Max. PayPal honors the hold for 3 days" },
] as const;

const HEADLINE: Record<string, string> = {
  DRAFT: "The table is open.",
  OPEN: "Waiting for the table.",
  FUNDED: "Everyone's in.",
  CAPTURING: "Charging now…",
  SETTLED: "All settled.",
  EXPIRED: "Time ran out.",
  CANCELLED: "Cancelled.",
  FAILED: "A payment failed.",
};

export function Host({ code }: { code: string }) {
  const token = useSearchParams().get("t") ?? "";
  const toast = useToast();
  const confirm = useConfirm();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [deadline, setDeadline] = useState<(typeof DEADLINES)[number]["value"]>("24");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${code}`, { headers: await hostHeaders(token), cache: "no-store" });
      if (res.status === 404 || res.status === 403) return setLoad({ kind: "invalid" });
      if (!res.ok) throw new Error();
      const room = (await res.json()) as HostView;
      if (room.role !== "host") return setLoad({ kind: "invalid" });
      setLoad((p) => (p.kind === "ok" && JSON.stringify(p.room) === JSON.stringify(room) ? p : { kind: "ok", room }));
    } catch {
      setLoad((p) => (p.kind === "ok" ? p : { kind: "error" }));
    }
  }, [code, token]);

  const status = load.kind === "ok" ? load.room.status : "";
  const live = load.kind === "ok" && (LIVE.includes(status) || status === "DRAFT");
  useEffect(() => {
    const first = window.setTimeout(() => {
      void refresh();
    }, 0);
    const poll = live ? window.setInterval(() => void refresh(), 3000) : undefined;
    const tick = live ? window.setInterval(() => setNow(Date.now()), 30_000) : undefined;
    return () => {
      window.clearTimeout(first);
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [live, refresh]);

  if (load.kind === "loading") return <div className="h-64 animate-pulse rounded-3xl bg-paper-2" aria-label="Loading" />;
  if (load.kind !== "ok") {
    return (
      <section>
        <h1 className="display text-5xl">{load.kind === "invalid" ? "This link doesn't work." : "Couldn't load."}</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-muted">
          {load.kind === "invalid" ? "Use the organizer link you got when you created the room." : "Check your connection and reload the page."}
        </p>
      </section>
    );
  }

  const { room } = load;
  const money = (c: number) => formatMoney(c, room.currency, "en-US");
  const progress = room.progress ?? { done: 0, total: 0 };
  const closed = ["FUNDED", "CAPTURING", "SETTLED"].includes(room.status);
  const left = timeLeft(room.deadlineAt, now);
  const waiting = room.participants.filter((p) => ["UNPAID", "ORDER_CREATED", "VOIDED"].includes(p.paymentStatus) && (p.shareCents ?? 0) > 0);
  const tableUrl = `${window.location.origin}/t/${code}`;
  const draft = room.status === "DRAFT";
  const me = room.participants.find((p) => p.isHost);
  // Quien no debe nada (parte en cero) no estorba en la lista una vez cerrada la mesa.
  const shown = draft ? room.participants : room.participants.filter((p) => p.paymentStatus !== "EXEMPT");
  const untaken = room.items.filter((i) => i.takenBy.length === 0).length;
  const nameOf = (id: string) => room.participants.find((p) => p.id === id)?.name ?? "";

  async function copy(text: string, title: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ tone: "ok", title });
    } catch {
      toast({ tone: "error", title: "Couldn't copy", body: "Your browser blocked the clipboard." });
    }
  }

  async function cancel() {
    const ok = await confirm({
      title: "Cancel this bill?",
      body: "Every hold is released and nobody is charged. This can't be undone.",
      confirmLabel: "Cancel the bill",
      cancelLabel: "Keep it",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/rooms/${code}/cancel`, { method: "POST", headers: await hostHeaders(token) });
      if (!res.ok) throw new Error();
      toast({ tone: "ok", title: "Bill cancelled", body: "All holds were released." });
      await refresh();
    } catch {
      toast({ tone: "error", title: "Couldn't cancel", body: "It may already be charging. Reload and check." });
    } finally {
      setBusy(false);
    }
  }

  async function closeTable() {
    const ok = await confirm({
      title: "Close the table?",
      body:
        untaken > 0
          ? `${untaken} item${untaken > 1 ? "s" : ""} nobody tapped will be split among everyone. Nobody new can join after this.`
          : "Everyone gets their exact amount and a payment button. Nobody new can join after this.",
      confirmLabel: "Close the table",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/rooms/${code}/lock`, {
        method: "POST",
        headers: { ...(await hostHeaders(token)), "content-type": "application/json" },
        body: JSON.stringify({ deadlineHours: Number(deadline) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          tone: "error",
          title: "Couldn't close the table",
          body: data.error === "need_two_people" ? "Wait for at least one more person to join." : (data.message ?? "Please try again."),
        });
        return;
      }
      toast({ tone: "ok", title: "Table closed", body: "Everyone can pay now. Nobody is charged until the last one confirms." });
      await refresh();
    } catch {
      toast({ tone: "error", title: "Couldn't close the table", body: "Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  const invite = `Join the table for ${room.merchant ?? "our bill"}: tap what you had and pay only your part. Nobody pays until everybody does. ${tableUrl}`;
  const reminder = `Still waiting on a few of us for ${room.merchant ?? "the bill"} - nobody is charged until everybody confirms: ${tableUrl}`;

  return (
    <section>
      <p className="font-mono text-[11px] uppercase tracking-wide text-muted">
        {room.merchant ?? "Shared bill"}
        {left && room.status === "OPEN" && (
          <>
            {" · "}
            <Clock aria-hidden className="mb-0.5 inline size-3" /> {left}
          </>
        )}
      </p>
      <h1 className="display mt-2 text-5xl sm:text-6xl">{HEADLINE[room.status] ?? "Your room."}</h1>

      {draft && (
        <div className="mt-8 rounded-3xl bg-ink p-6 text-paper">
          <p className="font-mono text-[11px] uppercase tracking-wide text-paper/60">One link for the whole table</p>
          <p translate="no" className="mt-2 break-all font-mono text-lg">{tableUrl.replace(/^https?:\/\//, "")}</p>
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => void copy(tableUrl, "Table link copied")}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-paper/25 px-4 py-3 text-[15px] transition-colors hover:bg-paper/10"
            >
              <Copy aria-hidden className="size-4" /> Copy link
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(invite)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-paper px-4 py-3 text-[15px] text-ink transition-colors hover:bg-accent-soft"
            >
              <Share2 aria-hidden className="size-4" /> WhatsApp
            </a>
          </div>
          <p className="mt-4 text-sm text-paper/70">Anyone with it enters their name, taps what they had, and later pays their part.</p>
        </div>
      )}

      {draft && me && (
        <Link href={`/t/${code}`} className="mt-3 inline-block text-sm underline underline-offset-4 hover:text-accent">
          Tap your own items
        </Link>
      )}

      {!draft && (
      <div className="mt-8 flex items-center gap-6 rounded-3xl border border-line bg-paper-2 p-5">
        <Ring done={progress.done} total={progress.total} closed={closed} />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] uppercase tracking-wide text-muted">Bill total</p>
          <p translate="no" className="font-mono text-3xl tabular-nums">{room.grandTotalCents === null ? "—" : money(room.grandTotalCents)}</p>
          <p className="mt-2 text-sm text-muted">
            {room.status === "OPEN" && `${progress.total - progress.done} to go. Nobody is charged until the last one confirms.`}
            {room.status === "SETTLED" && "Everyone paid."}
            {room.status === "EXPIRED" && "Holds released. Nobody was charged."}
            {room.status === "CANCELLED" && "Holds released. Nobody was charged."}
          </p>
        </div>
      </div>
      )}

      {draft && (
        <h2 className="mb-3 mt-10 font-mono text-[11px] uppercase tracking-wide text-muted">
          At the table ({room.participants.length})
        </h2>
      )}

      <ul className="mt-6 space-y-2">
        {shown.map((p) => {
          const s = STATUS[p.paymentStatus] ?? STATUS.UNPAID;
          return (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3">
              <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${s.dot}`} />
              <span className="min-w-0 flex-1 truncate text-[15px]">
                {p.name}
                {p.isHost && <span className="ml-2 font-mono text-[11px] uppercase text-muted">you</span>}
              </span>
              {draft ? (
                <span className="font-mono text-[11px] uppercase text-muted">
                  {room.items.filter((i) => i.takenBy.includes(p.id)).length} items
                </span>
              ) : (
                <>
                  <span translate="no" className="font-mono text-sm tabular-nums">{p.shareCents === null ? "" : money(p.shareCents)}</span>
                  <span className="w-24 text-right font-mono text-[11px] uppercase text-muted">{s.label}</span>
                </>
              )}
            </li>
          );
        })}
      </ul>

      {draft && (
        <div className="mt-8">
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-wide text-muted">Who had what</h2>
          <ul className="divide-y divide-line rounded-3xl border border-line bg-paper-2 px-4">
            {room.items.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-3 text-[15px]">
                <span className="min-w-0 truncate">{i.name}</span>
                <span translate="no" className="shrink-0 font-mono text-[11px] uppercase text-muted">
                  {i.takenBy.length ? i.takenBy.map(nameOf).join(", ") : "nobody yet"}
                </span>
              </li>
            ))}
          </ul>
          {untaken > 0 && (
            <p className="mt-3 text-sm text-muted">{untaken} item{untaken > 1 ? "s" : ""} nobody tapped will be split evenly among the whole table.</p>
          )}
          <div className="mt-6 max-w-xs">
            <Select label="Time to pay" value={deadline} options={DEADLINES} onChange={setDeadline} />
            <p className="mt-2 text-xs text-muted">If the table isn&apos;t complete by then, every hold is released and nobody is charged.</p>
          </div>
          <Button className="mt-6 w-full" busy={busy} disabled={room.participants.length < 2} onClick={closeTable}>
            {room.participants.length < 2 ? "Waiting for someone to join" : "Close the table and collect"}
          </Button>
        </div>
      )}

      {room.status === "OPEN" && me && ["UNPAID", "ORDER_CREATED", "VOIDED"].includes(me.paymentStatus) && (me.shareCents ?? 0) > 0 && (
        <Link
          href={`/t/${code}`}
          className="mt-8 flex items-center justify-center rounded-full bg-ink px-6 py-3.5 text-[15px] text-paper transition-colors hover:bg-accent"
        >
          Pay your share · {money(me.shareCents ?? 0)}
        </Link>
      )}

      {room.status === "OPEN" && waiting.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-wide text-muted">Still missing</h2>
          <p translate="no" className="text-[15px]">{waiting.map((p) => p.name).join(", ")}</p>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(reminder)}`}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[15px] text-paper transition-colors hover:bg-accent"
          >
            <Share2 aria-hidden className="size-4" /> Remind the table on WhatsApp
          </a>
        </div>
      )}

      {room.status === "SETTLED" && (
        <p className="mt-8 flex items-center gap-2 text-[15px]">
          <Check aria-hidden className="size-5 text-ok" /> Collected from everyone.
        </p>
      )}

      {["DRAFT", "OPEN", "FUNDED"].includes(room.status) && (
        <div className="mt-12 border-t border-line pt-6">
          <Button variant="ghost" busy={busy} onClick={cancel} className="text-danger">
            Cancel this bill
          </Button>
        </div>
      )}
    </section>
  );
}
