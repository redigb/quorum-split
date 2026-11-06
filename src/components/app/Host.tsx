"use client";

import { Check, Clock, Copy, Share2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMoney, type Currency } from "@/core/money";
import { findRoom, type SavedRoom } from "@/components/app/my-rooms";
import { LIVE, Ring, STATUS, timeLeft } from "@/components/app/Participant";
import { Button } from "@/components/ui/Button";
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
}
type Load = { kind: "loading" } | { kind: "invalid" } | { kind: "error" } | { kind: "ok"; room: HostView };

const HEADLINE: Record<string, string> = {
  DRAFT: "Almost ready.",
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
  const [saved, setSaved] = useState<SavedRoom | undefined>();

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
  const live = load.kind === "ok" && LIVE.includes(status);
  useEffect(() => {
    const first = window.setTimeout(() => {
      setSaved(findRoom(code));
      void refresh();
    }, 0);
    const poll = live ? window.setInterval(() => void refresh(), 3000) : undefined;
    const tick = live ? window.setInterval(() => setNow(Date.now()), 30_000) : undefined;
    return () => {
      window.clearTimeout(first);
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [live, refresh, code]);

  const linkOf = useMemo(() => new Map((saved?.links ?? []).map((l) => [l.id, l.url])), [saved]);

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

      <ul className="mt-6 space-y-2">
        {room.participants.map((p) => {
          const s = STATUS[p.paymentStatus] ?? STATUS.UNPAID;
          return (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3">
              <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${s.dot}`} />
              <span className="min-w-0 flex-1 truncate text-[15px]">
                {p.name}
                {p.isHost && <span className="ml-2 font-mono text-[11px] uppercase text-muted">you</span>}
              </span>
              <span translate="no" className="font-mono text-sm tabular-nums">{p.shareCents === null ? "" : money(p.shareCents)}</span>
              <span className="w-24 text-right font-mono text-[11px] uppercase text-muted">{s.label}</span>
            </li>
          );
        })}
      </ul>

      {room.status === "OPEN" && waiting.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-wide text-muted">Nudge who&apos;s missing</h2>
          {linkOf.size === 0 ? (
            <p className="rounded-2xl bg-paper-2 p-4 text-sm leading-relaxed text-muted">
              The participant links live on the device where you created the room. Open this page there to resend them.
            </p>
          ) : (
            <ul className="space-y-2">
              {waiting.map((p) => {
                const url = linkOf.get(p.id);
                if (!url) return null;
                const text = `${p.name}, you're the last piece: your share of ${room.merchant ?? "the bill"} is ${money(p.shareCents ?? 0)}. Nobody pays until everybody does: ${url}`;
                return (
                  <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-paper-2 px-4 py-3">
                    <span className="min-w-0 flex-1 truncate text-[15px]">{p.name}</span>
                    <button
                      type="button"
                      aria-label={`Copy ${p.name}'s link`}
                      onClick={() => void copy(url, "Link copied")}
                      className="grid size-10 place-items-center rounded-full border border-line transition-colors hover:bg-paper-3"
                    >
                      <Copy aria-hidden className="size-4" />
                    </button>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(text)}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Nudge ${p.name} on WhatsApp`}
                      className="grid size-10 place-items-center rounded-full bg-ink text-paper transition-colors hover:bg-accent"
                    >
                      <Share2 aria-hidden className="size-4" />
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {room.status === "SETTLED" && (
        <p className="mt-8 flex items-center gap-2 text-[15px]">
          <Check aria-hidden className="size-5 text-ok" /> Collected from everyone.
        </p>
      )}

      {["OPEN", "FUNDED"].includes(room.status) && (
        <div className="mt-12 border-t border-line pt-6">
          <Button variant="ghost" busy={busy} onClick={cancel} className="text-danger">
            Cancel this bill
          </Button>
        </div>
      )}
    </section>
  );
}
