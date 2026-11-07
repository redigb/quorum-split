"use client";

import { loadScript, type PayPalNamespace } from "@paypal/paypal-js";
import { Check, ChevronDown, Clock, Copy, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatMoney, type Currency } from "@/core/money";
import { DrawOverlay } from "@/components/app/DrawOverlay";
import { deleteDemo, findRoom } from "@/components/app/my-rooms";
import { useToast } from "@/components/ui/Toaster";
import { PageSkeleton } from "@/components/ui/Skeleton";

interface RoomView {
  role: "host" | "participant";
  me: string | null;
  status: string;
  demo?: boolean;
  mode?: "fair" | "lucky";
  loserId?: string | null;
  grandTotalCents?: number | null;
  merchant: string | null;
  currency: Currency;
  deadlineAt: string | null;
  progress: { done: number; total: number } | null;
  participants: { id: string; name: string; isHost: boolean; paymentStatus: string; shareCents: number | null }[];
  myBreakdown: { totalCents: number; lines: { itemId: string | null; label: string; amountCents: number }[] } | null;
}

type Load = { kind: "loading" } | { kind: "invalid" } | { kind: "error" } | { kind: "ok"; room: RoomView };

export const LIVE = ["OPEN", "FUNDED", "CAPTURING"];

/** Anillo de quórum: se cierra cuando todos autorizan. */
export function Ring({ done, total, closed }: { done: number; total: number; closed: boolean }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = total ? done / total : 0;
  return (
    <div className="relative grid size-40 place-items-center" role="img" aria-label={`${done} of ${total} confirmed`}>
      <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="9" className="stroke-paper-3" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className={`transition-[stroke-dashoffset] duration-700 ease-out ${closed ? "stroke-ok" : "stroke-accent"}`}
        />
      </svg>
      <div className="text-center" translate="no">
        <p className="font-mono text-4xl tabular-nums">
          {done}
          <span className="text-xl text-muted">/{total}</span>
        </p>
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted">confirmed</p>
      </div>
    </div>
  );
}

export function timeLeft(deadlineAt: string | null, now: number): string | null {
  if (!deadlineAt) return null;
  const ms = new Date(deadlineAt).getTime() - now;
  if (ms <= 0) return "Time is up";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h} h ${m} min left` : `${m} min left`;
}

/** Botón oficial de PayPal (SDK). El monto lo decide el servidor al crear la orden, no este componente. */
function PayPalButton({
  currency,
  code,
  token,
  onDone,
}: {
  currency: Currency;
  code: string;
  token: string;
  onDone: () => void;
}) {
  const toast = useToast();
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    let buttons: ReturnType<NonNullable<PayPalNamespace["Buttons"]>> | null = null;
    let cancelled = false;
    const auth = { authorization: `Bearer ${token}` };

    (async () => {
      let paypal: PayPalNamespace | null = null;
      try {
        paypal = await loadScript({
          clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "",
          currency,
          intent: "authorize",
          components: "buttons",
        });
      } catch {
        paypal = null;
      }
      if (cancelled || !box.current) return;
      if (!paypal?.Buttons) return setState("unavailable");

      buttons = paypal.Buttons({
        style: { layout: "vertical", shape: "pill", label: "pay", height: 48 },
        createOrder: async () => {
          const res = await fetch(`/api/rooms/${code}/orders`, { method: "POST", headers: auth });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "order_failed");
          return data.orderId as string;
        },
        onApprove: async (data) => {
          const res = await fetch(`/api/rooms/${code}/orders/${data.orderID}/authorize`, { method: "POST", headers: auth });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            toast({
              tone: "error",
              title: body.error === "amount_changed" ? "Your amount changed" : "We couldn't confirm your payment",
              body: body.message ?? "Nothing was charged. Please try again.",
            });
          } else {
            toast({ tone: "ok", title: "You're in", body: "Your money is on hold — nobody is charged yet." });
          }
          onDone();
        },
        onCancel: () => toast({ tone: "info", title: "Payment cancelled", body: "Nothing was charged." }),
        onError: () => toast({ tone: "error", title: "PayPal had a problem", body: "Nothing was charged. Please try again." }),
      });
      await buttons.render(box.current);
      if (!cancelled) setState("ready");
    })();

    return () => {
      cancelled = true;
      void buttons?.close().catch(() => {});
    };
  }, [currency, code, token, toast, onDone]);

  return (
    <div>
      <div ref={box} className={state === "ready" ? "" : "hidden"} />
      {state === "loading" && <div className="h-12 animate-pulse rounded-full bg-paper-3" aria-label="Loading PayPal" />}
      {state === "unavailable" && (
        <p role="alert" className="rounded-2xl bg-paper-2 p-4 text-sm text-muted">
          PayPal couldn&apos;t load. Check your connection and reload the page.
        </p>
      )}
    </div>
  );
}

/** Aviso del modo demo: qué es de mentira y con qué cuenta se paga. Las credenciales Sandbox son opcionales (variables públicas). */
function DemoNote({ lucky, code }: { lucky: boolean; code: string }) {
  const toast = useToast();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const email = process.env.NEXT_PUBLIC_DEMO_BUYER_EMAIL;
  const password = process.env.NEXT_PUBLIC_DEMO_BUYER_PASSWORD;
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ tone: "ok", title: `${what} copied` });
    } catch {
      toast({ tone: "error", title: "Couldn't copy" });
    }
  };
  return (
    <div className="mt-6 rounded-3xl border border-accent/30 bg-accent-soft p-5 text-[15px] leading-relaxed">
      <p className="font-semibold">Demo table</p>
      <p className="mt-1 text-muted">
        {lucky ? (
          <>
            Maya, Leo and Sofia are simulated and said yes. In the demo the card <strong className="font-semibold text-ink">always lands on you</strong>, so you can test the payment with a{" "}
            <strong className="font-semibold text-ink">PayPal Sandbox</strong> buyer account. In real tables the draw is random. Nothing real is charged.
          </>
        ) : (
          <>
            Maya, Leo and Sofia are simulated and confirm on their own in a few seconds. You&apos;re the last one: pay with a{" "}
            <strong className="font-semibold text-ink">PayPal Sandbox</strong> buyer account. Nothing real is charged.
          </>
        )}
      </p>
      {email && password && (
        <div className="mt-4 space-y-2 text-sm">
          {[
            ["Email", email],
            ["Password", password],
          ].map(([k, v]) => (
            <button
              key={k}
              type="button"
              onClick={() => void copy(v, k)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl bg-paper px-4 py-2.5 text-left transition-colors hover:bg-paper-2"
            >
              <span className="font-mono text-[11px] uppercase text-muted">{k}</span>
              <span translate="no" className="min-w-0 flex-1 truncate text-right font-mono">{v}</span>
              <Copy aria-hidden className="size-4 shrink-0 text-muted" />
            </button>
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link href="/demo" className="underline underline-offset-4 hover:text-accent">Try the other mode</Link>
        {findRoom(code) && (
          <button
            type="button"
            disabled={deleting}
            onClick={async () => {
              setDeleting(true);
              const ok = await deleteDemo(code);
              if (ok) router.push("/demo");
              else {
                setDeleting(false);
                toast({ tone: "error", title: "Couldn't delete the demo", body: "Please try again." });
              }
            }}
            className="text-muted underline underline-offset-4 transition-colors hover:text-danger disabled:opacity-40"
          >
            {deleting ? "Deleting…" : "Delete this demo"}
          </button>
        )}
      </div>
    </div>
  );
}

export const STATUS: Record<string, { label: string; dot: string }> = {
  UNPAID: { label: "Waiting", dot: "bg-faint" },
  ORDER_CREATED: { label: "Paying…", dot: "bg-hold" },
  AUTHORIZED: { label: "Confirmed", dot: "bg-hold" },
  CAPTURED: { label: "Paid", dot: "bg-ok" },
  VOIDED: { label: "Released", dot: "bg-faint" },
  FAILED: { label: "Problem", dot: "bg-danger" },
  EXEMPT: { label: "Nothing to pay", dot: "bg-paper-3" },
};

export function Participant({ code, token }: { code: string; token: string }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${code}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
      if (res.status === 404 || res.status === 403) return setLoad({ kind: "invalid" });
      if (!res.ok) throw new Error();
      const room = (await res.json()) as RoomView;
      // Solo cambia el estado si cambió algo: evita repintar mientras el comprador usa PayPal.
      setLoad((prev) => (prev.kind === "ok" && JSON.stringify(prev.room) === JSON.stringify(room) ? prev : { kind: "ok", room }));
    } catch {
      setLoad((prev) => (prev.kind === "ok" ? prev : { kind: "error" }));
    }
  }, [code, token]);

  const status = load.kind === "ok" ? load.room.status : "";
  const live = load.kind === "ok" && LIVE.includes(status);
  useEffect(() => {
    // Carga inicial + Plan B del tiempo real: consultar cada 3 s mientras la sala está viva.
    const first = window.setTimeout(() => void refresh(), 0);
    const poll = live ? window.setInterval(() => void refresh(), 3000) : undefined;
    const tick = live ? window.setInterval(() => setNow(Date.now()), 30_000) : undefined;
    return () => {
      window.clearTimeout(first);
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [live, refresh]);

  if (load.kind === "loading") return <PageSkeleton />;

  if (load.kind === "invalid" || load.kind === "error") {
    return (
      <section className="stagger">
        <h1 className="display text-5xl">{load.kind === "invalid" ? "This link doesn't work." : "Couldn't load."}</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-muted">
          {load.kind === "invalid"
            ? "Ask whoever organized the bill to send your link again."
            : "Check your connection and reload the page."}
        </p>
      </section>
    );
  }

  const { room } = load;
  const me = room.participants.find((p) => p.id === room.me);
  if (!me) {
    return (
      <section className="stagger">
        <h1 className="display text-5xl">This is the organizer&apos;s link.</h1>
        <p className="mt-4 text-[15px] text-muted">Open your own participant link to pay your share.</p>
      </section>
    );
  }

  const money = (c: number) => formatMoney(c, room.currency, "en-US");
  const amount = me.shareCents ?? 0;
  const mine = me.paymentStatus;
  const canPay = room.status === "OPEN" && ["UNPAID", "ORDER_CREATED", "VOIDED"].includes(mine) && amount > 0;
  const left = timeLeft(room.deadlineAt, now);
  const progress = room.progress ?? { done: 0, total: 0 };
  const closed = ["FUNDED", "CAPTURING", "SETTLED"].includes(room.status);
  const first = me.name.split(" ")[0];

  return (
    <section className="stagger">
      {room.mode === "lucky" && room.grandTotalCents != null && <DrawOverlay code={code} room={room} totalCents={room.grandTotalCents} />}
      <p className="font-mono text-[11px] uppercase tracking-wide text-muted">
        {room.merchant ?? "Shared bill"}
        {left && room.status === "OPEN" && (
          <>
            {" · "}
            <Clock aria-hidden className="mb-0.5 inline size-3" /> {left}
          </>
        )}
      </p>
      <h1 className="display mt-2 text-5xl sm:text-6xl">
        Hi {first}.
      </h1>

      {room.status === "DRAFT" && (
        <p className="mt-6 text-[15px] leading-relaxed text-muted">The organizer is still setting up the split. This page updates when it&apos;s ready — come back in a moment.</p>
      )}

      {room.demo && room.status !== "DRAFT" && <DemoNote lucky={room.mode === "lucky"} code={code} />}

      {room.status !== "DRAFT" && (
        <>
          {/* monto: protagonista */}
          <div className="mt-8 rounded-3xl bg-ink p-7 text-paper">
            <p className="font-mono text-[11px] uppercase tracking-wide text-paper/60">Your share</p>
            <p translate="no" className="mt-2 font-mono text-6xl tabular-nums sm:text-7xl">
              {money(amount)}
            </p>
            {room.myBreakdown && room.myBreakdown.lines.length > 0 && (
              <>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpen((o) => !o)}
                  className="mt-5 flex items-center gap-1.5 text-sm text-paper/70 transition-colors hover:text-paper"
                >
                  <span>{open ? "Hide" : "See"} the breakdown</span>
                  <ChevronDown aria-hidden className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
                </button>
                {open && (
                  <ul className="pop-in mt-3 space-y-2 border-t border-paper/15 pt-3 text-sm">
                    {room.myBreakdown.lines.map((l, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span className="text-paper/80">{l.label}</span>
                        <span translate="no" className="font-mono tabular-nums">{money(l.amountCents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          {/* acción según el estado */}
          <div className="mt-6">
            {canPay && (
              <>
                <PayPalButton currency={room.currency} code={code} token={token} onDone={refresh} />
                <p className="mt-4 flex items-start gap-2 text-sm leading-relaxed text-muted">
                  <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
                  <span>
                    You&apos;re not charged now — PayPal only <strong className="font-semibold text-ink">holds</strong> the amount. It&apos;s charged when
                    everyone has confirmed. If they don&apos;t in time, the hold is released.
                  </span>
                </p>
              </>
            )}

            {mine === "AUTHORIZED" && room.status === "OPEN" && (
              <p className="flex items-center gap-2 text-[15px]">
                <Check aria-hidden className="size-5 text-ok" /> You&apos;re in. Waiting for the rest of the table.
              </p>
            )}
            {(mine === "CAPTURED" || room.status === "SETTLED") && mine !== "EXEMPT" && (
              <p className="flex items-center gap-2 text-[15px]">
                <Check aria-hidden className="size-5 text-ok" /> Paid. Everyone confirmed — thanks!
              </p>
            )}
            {closed && room.status !== "SETTLED" && mine === "AUTHORIZED" && (
              <p className="text-[15px] text-muted">Everyone confirmed. Charging now…</p>
            )}
            {room.status === "EXPIRED" && <p className="text-[15px] text-muted">The time ran out before everyone confirmed. Every hold was released — nobody was charged.</p>}
            {room.status === "CANCELLED" && <p className="text-[15px] text-muted">The organizer cancelled this bill. Nothing was charged.</p>}
            {room.status === "FAILED" && <p role="alert" className="text-[15px] text-danger">A payment couldn&apos;t be processed. The organizer has been notified.</p>}
            {mine === "EXEMPT" && room.mode === "lucky" && (
              <p className="text-[15px]">
                🍀 You were spared. <span translate="no" className="font-semibold">{room.participants.find((p) => p.id === room.loserId)?.name ?? "Someone"}</span> pays it all.
              </p>
            )}
            {mine === "EXEMPT" && room.mode !== "lucky" && <p className="text-[15px] text-muted">You don&apos;t owe anything on this one.</p>}
            {room.mode === "lucky" && room.loserId === room.me && room.status === "OPEN" && mine !== "AUTHORIZED" && (
              <p className="mb-4 text-[15px]">The card landed on you. You pay it all — it&apos;s a game, and you agreed to play.</p>
            )}
          </div>

          {/* el grupo */}
          <div className="mt-10 flex items-center gap-6 rounded-3xl border border-line bg-paper-2 p-5">
            <Ring done={progress.done} total={progress.total} closed={closed} />
            <ul className="min-w-0 flex-1 space-y-2.5">
              {room.participants.map((p) => {
                const s = STATUS[p.paymentStatus] ?? STATUS.UNPAID;
                return (
                  <li key={p.id} className="flex items-center gap-2.5 text-sm">
                    <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${s.dot}`} />
                    <span className="min-w-0 flex-1 truncate">{p.id === room.me ? "You" : p.name}</span>
                    <span className="font-mono text-[11px] uppercase text-muted">{s.label}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <p className="mt-10 text-center text-sm text-muted">
            Next time you split a bill?{" "}
            <Link href="/new" className="text-ink underline underline-offset-4 hover:text-accent">
              Organize it with Quorum
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
