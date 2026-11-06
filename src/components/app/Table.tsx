"use client";

import { Check, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatMoney, type Currency } from "@/core/money";
import { findRoom, getMyToken, saveMyToken } from "@/components/app/my-rooms";
import { Participant } from "@/components/app/Participant";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";

interface Preview {
  status: string;
  merchant: string | null;
  currency: Currency;
  people: number;
  joinable: boolean;
}
interface TableView {
  me: string | null;
  status: string;
  merchant: string | null;
  currency: Currency;
  billTotalCents: number;
  items: { id: string; name: string; quantity: number; lineTotalCents: number; takenBy: string[] }[];
  participants: { id: string; name: string; isHost: boolean }[];
}

const field =
  "w-full rounded-2xl border border-line bg-paper px-4 py-3 text-[15px] outline-none transition-colors placeholder:text-faint hover:bg-paper-2 focus:border-accent";

const JOIN_ERRORS: Record<string, string> = {
  name_taken: "Someone at the table already uses that name. Add your initial or a nickname.",
  table_closed: "The organizer already closed this table.",
  table_full: "This table is full.",
};

/** El enlace único de la mesa: entras con tu nombre, marcas lo que consumiste y, al cerrarse, pagas tu parte. */
export function Table({ code }: { code: string }) {
  const toast = useToast();
  const [token, setToken] = useState<string | null | undefined>(undefined); // undefined = aún leyendo el navegador
  const [preview, setPreview] = useState<Preview | "missing" | null>(null);
  const [view, setView] = useState<TableView | "invalid" | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setToken(getMyToken(code)), 0);
    return () => window.clearTimeout(t);
  }, [code]);

  // Sin token: lo mínimo público para mostrar el formulario de unirse.
  useEffect(() => {
    if (token !== null && view !== "invalid") return;
    let off = false;
    void fetch(`/api/rooms/${code}/preview`, { cache: "no-store" }).then(async (r) => {
      if (off) return;
      setPreview(r.ok ? ((await r.json()) as Preview) : "missing");
    });
    return () => {
      off = true;
    };
  }, [token, view, code]);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/rooms/${code}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
      if (res.status === 404 || res.status === 403) return setView("invalid");
      if (!res.ok) return;
      const data = (await res.json()) as TableView;
      setView((p) => (p && p !== "invalid" && JSON.stringify(p) === JSON.stringify(data) ? p : data));
    } catch {
      /* el siguiente ciclo reintenta */
    }
  }, [code, token]);

  const draft = view !== null && view !== "invalid" && view.status === "DRAFT";
  const loading = view === null;
  useEffect(() => {
    if (!token) return;
    const first = window.setTimeout(() => void refresh(), 0);
    // Plan B del tiempo real: mientras la mesa está abierta, consultamos cada 3 s.
    const poll = loading || draft ? window.setInterval(() => void refresh(), 3000) : undefined;
    return () => {
      window.clearTimeout(first);
      window.clearInterval(poll);
    };
  }, [token, refresh, draft, loading]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/rooms/${code}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: n }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ tone: "error", title: "Couldn't join", body: JOIN_ERRORS[data.error] ?? "Please try again." });
        return;
      }
      saveMyToken(code, data.token);
      setView(null);
      setToken(data.token);
    } catch {
      toast({ tone: "error", title: "Couldn't join", body: "Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  async function take(itemId: string, taking: boolean) {
    if (!token || view === null || view === "invalid" || !view.me) return;
    const me = view.me;
    // Optimista: se marca al instante y el servidor confirma en el siguiente ciclo.
    setView({
      ...view,
      items: view.items.map((i) =>
        i.id === itemId ? { ...i, takenBy: taking ? [...i.takenBy.filter((x) => x !== me), me] : i.takenBy.filter((x) => x !== me) } : i,
      ),
    });
    try {
      const res = await fetch(`/api/rooms/${code}/take`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ itemId, taking }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast({ tone: "error", title: "Couldn't save that", body: "The table may have just closed." });
    }
    void refresh();
  }

  if (token === undefined) return <div className="h-64 animate-pulse rounded-3xl bg-paper-2" aria-label="Loading" />;

  /* ---- no se ha unido (o su token ya no sirve) ---- */
  if (token === null || view === "invalid") {
    if (preview === null) return <div className="h-64 animate-pulse rounded-3xl bg-paper-2" aria-label="Loading" />;
    if (preview === "missing") {
      return (
        <section>
          <h1 className="display text-5xl">This table doesn&apos;t exist.</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted">Check the link, or ask whoever organized the bill to send it again.</p>
        </section>
      );
    }
    if (!preview.joinable) {
      return (
        <section>
          <h1 className="display text-5xl">This table is closed.</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted">
            {preview.people >= 20
              ? "It's full."
              : "The organizer already locked the split. If you were at the table, open the link on the device where you joined."}
          </p>
        </section>
      );
    }
    return (
      <section>
        <p className="font-mono text-[11px] uppercase tracking-wide text-muted">{preview.merchant ?? "Shared bill"}</p>
        <h1 className="display mt-2 text-5xl sm:text-6xl">Join the table.</h1>
        <p className="mb-8 mt-4 text-[15px] leading-relaxed text-muted">
          Tell us your name, tap what you had, and pay only your part. No account, no app. Nobody is charged until everybody has confirmed.
        </p>
        <form onSubmit={join} className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your first name"
            aria-label="Your name"
            maxLength={60}
            autoComplete="given-name"
            className={field}
          />
          <Button type="submit" busy={busy} disabled={!name.trim()} className="w-full">
            Join the table
          </Button>
        </form>
        <p className="mt-6 flex items-center gap-2 text-sm text-muted">
          <Users aria-hidden className="size-4" /> {preview.people} {preview.people === 1 ? "person" : "people"} at the table
        </p>
      </section>
    );
  }

  if (view === null) return <div className="h-64 animate-pulse rounded-3xl bg-paper-2" aria-label="Loading" />;

  /* ---- mesa cerrada: a pagar ---- */
  if (view.status !== "DRAFT") return <Participant code={code} token={token} />;

  /* ---- mesa abierta: marcar lo que consumí ---- */
  const money = (c: number) => formatMoney(c, view.currency, "en-US");
  const me = view.me;
  const mineTotal = view.items.reduce((n, i) => (me && i.takenBy.includes(me) ? n + Math.round(i.lineTotalCents / i.takenBy.length) : n), 0);
  const myName = view.participants.find((p) => p.id === me)?.name ?? "";
  const nameOf = (id: string) => view.participants.find((p) => p.id === id)?.name ?? "";
  const hostPath = findRoom(code)?.hostPath;

  return (
    <section>
      <p className="font-mono text-[11px] uppercase tracking-wide text-muted">{view.merchant ?? "Shared bill"}</p>
      <h1 className="display mt-2 text-5xl sm:text-6xl">Hi {myName.split(" ")[0]}.</h1>
      <p className="mt-4 text-[15px] leading-relaxed text-muted">
        Tap everything you had. Shared a dish? Everyone who taps it splits it evenly. What nobody taps is split among the whole table.
      </p>

      <ul className="mt-8 space-y-2">
        {view.items.map((i) => {
          const mine = !!me && i.takenBy.includes(me);
          const others = i.takenBy.filter((x) => x !== me);
          return (
            <li key={i.id}>
              <button
                type="button"
                aria-pressed={mine}
                onClick={() => void take(i.id, !mine)}
                className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  mine ? "border-accent bg-accent-soft" : "border-line bg-paper hover:bg-paper-2"
                }`}
              >
                <span
                  aria-hidden
                  className={`grid size-6 shrink-0 place-items-center rounded-full border transition-colors ${mine ? "border-accent bg-accent text-paper" : "border-line"}`}
                >
                  {mine && <Check className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{i.name}</span>
                  {others.length > 0 && (
                    <span translate="no" className="block truncate font-mono text-[11px] uppercase text-muted">
                      {mine ? "with " : ""}
                      {others.map(nameOf).join(", ")}
                    </span>
                  )}
                </span>
                <span translate="no" className="font-mono text-sm tabular-nums">{money(i.lineTotalCents)}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 rounded-3xl bg-ink p-6 text-paper">
        <p className="font-mono text-[11px] uppercase tracking-wide text-paper/60">What you tapped</p>
        <p translate="no" className="mt-1 font-mono text-4xl tabular-nums">{money(mineTotal)}</p>
        <p className="mt-2 text-sm text-paper/70">Plus your share of tax and tip. The exact amount appears when the organizer closes the table.</p>
      </div>

      <p className="mt-6 flex items-center gap-2 text-sm text-muted">
        <Users aria-hidden className="size-4" /> {view.participants.length} at the table:{" "}
        <span translate="no">{view.participants.map((p) => p.name).join(", ")}</span>
      </p>
      <p className="mt-2 text-sm text-muted">This page updates by itself. Once the organizer closes the table, your payment button appears here.</p>

      {hostPath && (
        <p className="mt-8 text-sm">
          <Link href={hostPath} className="underline underline-offset-4 hover:text-accent">Back to organizer view</Link>
        </p>
      )}
    </section>
  );
}
