"use client";

import { Check, Clock, Copy, Dices, Pencil, Plus, Share2, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatMoney, type Currency } from "@/core/money";
import { addSavedLink, findRoom } from "@/components/app/my-rooms";
import { DrawOverlay } from "@/components/app/DrawOverlay";
import { LedgerTable } from "@/components/app/LedgerTable";
import { LIVE, Ring, STATUS, timeLeft } from "@/components/app/Participant";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useConfirm } from "@/components/ui/Confirm";
import { useToast } from "@/components/ui/Toaster";
import { hostHeaders } from "@/lib/auth-client";
import { PageSkeleton } from "@/components/ui/Skeleton";

interface HostView {
  role: "host" | "participant";
  status: string;
  mode: "fair" | "lucky";
  loserId: string | null;
  merchant: string | null;
  currency: Currency;
  deadlineAt: string | null;
  grandTotalCents: number | null;
  progress: { done: number; total: number } | null;
  participants: { id: string; name: string; isHost: boolean; luckyOk: boolean; paymentStatus: string; shareCents: number | null }[];
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
  const [newPerson, setNewPerson] = useState("");
  const [links, setLinks] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
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
      setLinks(Object.fromEntries((findRoom(code)?.links ?? []).map((l) => [l.id, l.url])));
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

  if (load.kind === "loading") return <PageSkeleton />;
  if (load.kind !== "ok") {
    return (
      <section className="stagger">
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
  const lucky = room.mode === "lucky";
  const allIn = room.participants.every((p) => p.luckyOk);
  const untaken = room.items.filter((i) => i.takenBy.length === 0).length;

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

  const PEOPLE_ERRORS: Record<string, string> = {
    name_taken: "Someone at the table already has that name.",
    table_closed: "The table is already closed.",
  };

  async function renamePerson() {
    if (!editing || !editing.name.trim()) return;
    try {
      const res = await fetch(`/api/rooms/${code}/participants/${editing.id}`, {
        method: "PATCH",
        headers: { ...(await hostHeaders(token)), "content-type": "application/json" },
        body: JSON.stringify({ name: editing.name.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast({ tone: "error", title: "Couldn't rename", body: PEOPLE_ERRORS[data.error] ?? "Please try again." });
      setEditing(null);
      await refresh();
    } catch {
      toast({ tone: "error", title: "Couldn't rename", body: "Check your connection and try again." });
    }
  }

  async function removePerson(id: string, name: string) {
    const ok = await confirm({
      title: `Remove ${name}?`,
      body: "They leave the table and the items they tapped go back to unclaimed. They can join again with the link.",
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/rooms/${code}/participants/${id}`, { method: "DELETE", headers: await hostHeaders(token) });
      if (!res.ok) throw new Error();
      toast({ tone: "ok", title: `${name} removed` });
      await refresh();
    } catch {
      toast({ tone: "error", title: "Couldn't remove", body: "The table may have just closed." });
    }
  }

  async function addPerson(e: React.FormEvent) {
    e.preventDefault();
    const name = newPerson.trim();
    if (!name) return;
    try {
      const res = await fetch(`/api/rooms/${code}/participants`, {
        method: "POST",
        headers: { ...(await hostHeaders(token)), "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast({ tone: "error", title: "Couldn't add them", body: PEOPLE_ERRORS[data.error] ?? "Please try again." });
      const url = `${window.location.origin}/r/${code}/p/${data.token}`;
      addSavedLink(code, { id: data.id, name, url });
      setLinks((l) => ({ ...l, [data.id]: url }));
      setNewPerson("");
      toast({ tone: "ok", title: `${name} added`, body: "Assign their items below. Copy their link so they can pay later." });
      await refresh();
    } catch {
      toast({ tone: "error", title: "Couldn't add them", body: "Check your connection and try again." });
    }
  }

  async function takeFor(itemId: string, participantId: string, taking: boolean) {
    try {
      const res = await fetch(`/api/rooms/${code}/take`, {
        method: "POST",
        headers: { ...(await hostHeaders(token)), "content-type": "application/json" },
        body: JSON.stringify({ itemId, participantId, taking }),
      });
      if (!res.ok) throw new Error();
      await refresh();
    } catch {
      toast({ tone: "error", title: "Couldn't save that", body: "The table may have just closed." });
    }
  }

  async function setMode(mode: "fair" | "lucky") {
    try {
      const res = await fetch(`/api/rooms/${code}/mode`, {
        method: "POST",
        headers: { ...(await hostHeaders(token)), "content-type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) throw new Error();
      await refresh();
    } catch {
      toast({ tone: "error", title: "Couldn't change the mode", body: "The table may have just closed." });
    }
  }

  async function closeTable() {
    const ok = await confirm({
      title: lucky ? "Draw the card?" : "Close the table?",
      body: lucky
        ? "One random person pays the whole bill. Everyone said yes, and the draw can't be redone."
        : untaken > 0
          ? `${untaken} item${untaken > 1 ? "s" : ""} nobody tapped will be split among everyone. Nobody new can join after this.`
          : "Everyone gets their exact amount and a payment button. Nobody new can join after this.",
      confirmLabel: lucky ? "Draw" : "Close the table",
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
      toast({ tone: "ok", title: lucky ? "The card is drawn" : "Table closed", body: lucky ? "Check who pays it all." : "Everyone can pay now. Nobody is charged until the last one confirms." });
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
    <section className="stagger">
      {lucky && room.grandTotalCents !== null && <DrawOverlay code={code} room={room} totalCents={room.grandTotalCents} />}
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
          {room.mode === "lucky" ? "Say you're in" : "Tap your own items"}
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
              {editing?.id === p.id ? (
                <form
                  className="flex min-w-0 flex-1 items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void renamePerson();
                  }}
                >
                  <input
                    autoFocus
                    aria-label={`New name for ${p.name}`}
                    value={editing.name}
                    maxLength={60}
                    onChange={(e) => setEditing({ id: p.id, name: e.target.value })}
                    onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                    className="min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 py-1.5 text-[15px] outline-none focus:border-accent"
                  />
                  <button type="submit" aria-label="Save name" className="grid size-8 place-items-center rounded-full bg-ink text-paper hover:bg-accent">
                    <Check aria-hidden className="size-4" />
                  </button>
                  <button type="button" aria-label="Cancel" onClick={() => setEditing(null)} className="grid size-8 place-items-center rounded-full border border-line hover:bg-paper-2">
                    <X aria-hidden className="size-4" />
                  </button>
                </form>
              ) : (
              <span className="min-w-0 flex-1 truncate text-[15px]">
                {p.name}
                {p.isHost && <span className="ml-2 font-mono text-[11px] uppercase text-muted">you</span>}
              </span>
              )}
              {draft && editing?.id !== p.id ? (
                <>
                  <span className="font-mono text-[11px] uppercase text-muted">
                    {lucky ? (p.luckyOk ? "in" : "thinking…") : `${room.items.filter((i) => i.takenBy.includes(p.id)).length} items`}
                  </span>
                  <button
                    type="button"
                    aria-label={`Rename ${p.name}`}
                    onClick={() => setEditing({ id: p.id, name: p.name })}
                    className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-paper-3 hover:text-ink"
                  >
                    <Pencil aria-hidden className="size-4" />
                  </button>
                  {links[p.id] && (
                    <button
                      type="button"
                      aria-label={`Copy ${p.name}'s link`}
                      onClick={() => void copy(links[p.id], "Their link copied")}
                      className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-paper-3 hover:text-ink"
                    >
                      <Copy aria-hidden className="size-4" />
                    </button>
                  )}
                  {!p.isHost && (
                    <button
                      type="button"
                      aria-label={`Remove ${p.name}`}
                      onClick={() => void removePerson(p.id, p.name)}
                      className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-paper-3 hover:text-danger"
                    >
                      <X aria-hidden className="size-4" />
                    </button>
                  )}
                </>
              ) : draft ? null : (
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
        <form onSubmit={addPerson} className="mt-3 flex gap-2">
          <input
            value={newPerson}
            onChange={(e) => setNewPerson(e.target.value)}
            placeholder="Add someone who isn't here"
            aria-label="Name of the person to add"
            maxLength={60}
            className="min-w-0 flex-1 rounded-2xl border border-line bg-paper px-4 py-3 text-[15px] outline-none transition-colors placeholder:text-faint hover:bg-paper-2 focus:border-accent"
          />
          <Button type="submit" variant="ghost" disabled={!newPerson.trim()} aria-label="Add person" className="px-4">
            <Plus aria-hidden className="size-5" />
          </Button>
        </form>
      )}

      {draft && (
        <div className="mt-8">
          <div role="radiogroup" aria-label="How to split" className="mb-6 flex gap-1 rounded-full bg-paper-2 p-1">
            {([
              ["fair", "Split fair"],
              ["lucky", "Feeling lucky"],
            ] as const).map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={room.mode === m}
                onClick={() => void setMode(m)}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-[15px] transition-colors ${
                  room.mode === m ? "bg-ink text-paper" : "text-muted hover:text-ink"
                }`}
              >
                {m === "lucky" && <Dices aria-hidden className="size-4" />} {label}
              </button>
            ))}
          </div>

          {lucky ? (
            <p className="rounded-2xl bg-paper-2 p-4 text-[15px] leading-relaxed text-muted">
              <strong className="font-semibold text-ink">A game between friends.</strong> If every person at the table says yes, a card is drawn and one of you pays the whole bill. Nobody is drawn unless everybody agrees.{" "}
              <span translate="no" className="text-ink">{room.participants.filter((p) => p.luckyOk).length}/{room.participants.length}</span> are in.
            </p>
          ) : (
            <>
              <h2 className="mb-3 font-mono text-[11px] uppercase tracking-wide text-muted">Who had what</h2>
              <ul className="divide-y divide-line rounded-3xl border border-line bg-paper-2 px-4">
                {room.items.map((i) => (
                  <li key={i.id} className="py-3 text-[15px]">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate">{i.name}</span>
                      <span translate="no" className="shrink-0 font-mono text-sm tabular-nums text-muted">{money(i.lineTotalCents)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {room.participants.map((p) => {
                        const on = i.takenBy.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() => void takeFor(i.id, p.id, !on)}
                            translate="no"
                            className={`rounded-full border px-3 py-1 text-[13px] transition-colors ${
                              on ? "border-accent bg-accent text-paper" : "border-line bg-paper hover:bg-paper-3"
                            }`}
                          >
                            {p.name}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ul>
              {untaken > 0 && (
                <p className="mt-3 text-sm text-muted">{untaken} item{untaken > 1 ? "s" : ""} nobody tapped will be split evenly among the whole table.</p>
              )}
            </>
          )}
          <div className="mt-6 max-w-xs">
            <Select label="Time to pay" value={deadline} options={DEADLINES} onChange={setDeadline} />
            <p className="mt-2 text-xs text-muted">If it isn&apos;t paid by then, every hold is released and nobody is charged.</p>
          </div>
          <Button className="mt-6 w-full" busy={busy} disabled={room.participants.length < 2 || (lucky && !allIn)} onClick={closeTable}>
            {room.participants.length < 2
              ? "Waiting for someone to join"
              : lucky
                ? allIn
                  ? "Draw the card"
                  : "Waiting for everyone to say yes"
                : "Close the table and collect"}
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

      <LedgerTable
        code={code}
        token={token}
        refreshKey={`${room.status}|${room.participants.map((p) => `${p.id}:${p.paymentStatus}:${p.name}`).join(",")}`}
      />

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
