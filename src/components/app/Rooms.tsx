"use client";

import { Archive, ArchiveRestore, ArrowUpRight, LogOut, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatMoney, type Currency } from "@/core/money";
import { claimLocalRooms } from "@/components/app/my-rooms";
import { EmailLogin } from "@/components/app/EmailLogin";
import { STATUS_LABEL } from "@/components/app/status";
import { Button } from "@/components/ui/Button";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toaster";
import { supabaseBrowser, useSession } from "@/lib/auth-client";

interface RoomRow {
  code: string;
  status: string;
  merchant: string | null;
  currency: Currency;
  createdAt: string;
  archivedAt: string | null;
  totalCents: number;
  collectedCents: number;
  heldCents: number;
  confirmed: number;
  payers: number;
}

const TONE: Record<string, string> = {
  OPEN: "bg-hold/40",
  FUNDED: "bg-ok-soft text-ok",
  CAPTURING: "bg-ok-soft text-ok",
  SETTLED: "bg-ok-soft text-ok",
  FAILED: "bg-danger/15 text-danger",
};

type Filter = "all" | "active" | "settled" | "closed" | "archived";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "settled", label: "Settled" },
  { id: "closed", label: "Cancelled" },
  { id: "archived", label: "Archived" },
];
const ACTIVE = ["DRAFT", "OPEN", "FUNDED", "CAPTURING"];
const CLOSED = ["CANCELLED", "EXPIRED", "FAILED"];
const PAGE = 8;

const matchesFilter = (r: RoomRow, f: Filter) =>
  f === "archived"
    ? !!r.archivedAt
    : !r.archivedAt &&
      (f === "all" || (f === "active" && ACTIVE.includes(r.status)) || (f === "settled" && r.status === "SETTLED") || (f === "closed" && CLOSED.includes(r.status)));

/* ---------- búsqueda: tolera acentos, mayúsculas y erratas ---------- */
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** 0 = no coincide. Más alto = mejor: código o texto exacto, por prefijo, o aproximado (con una errata). */
function score(r: RoomRow, query: string): number {
  const q = norm(query);
  if (!q) return 1;
  const name = norm(r.merchant ?? "shared bill");
  const code = r.code.toLowerCase();
  if (code === q) return 100;
  if (code.startsWith(q)) return 80;
  if (name.includes(q)) return 60 + (name.startsWith(q) ? 10 : 0);
  const date = new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toLowerCase();
  if (date.includes(q) || (STATUS_LABEL[r.status] ?? "").toLowerCase().startsWith(q)) return 40;
  const words = name.split(/\s+/);
  const near = q.split(/\s+/).every((w) => words.some((x) => distance(w, x.slice(0, Math.max(w.length, 1))) <= (w.length > 4 ? 2 : 1)));
  return near ? 20 : 0;
}

export function Rooms() {
  const session = useSession();
  const toast = useToast();
  const [rows, setRows] = useState<RoomRow[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const [shown, setShown] = useState(PAGE);
  const inputRef = useRef<HTMLInputElement>(null);
  const token = session?.access_token;

  useEffect(() => {
    if (!token) return;
    let off = false;
    (async () => {
      // Primero reclamamos las salas creadas en este dispositivo; luego listamos todas.
      const claimed = await claimLocalRooms(token);
      if (claimed > 0 && !off) toast({ tone: "ok", title: `${claimed} bill${claimed > 1 ? "s" : ""} saved to your account` });
      try {
        const res = await fetch("/api/me/rooms", { headers: { "x-session": token }, cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { rooms: RoomRow[] };
        if (!off) setRows(data.rooms);
      } catch {
        if (!off) toast({ tone: "error", title: "Couldn't load your bills", body: "Reload the page to try again." });
      }
    })();
    return () => {
      off = true;
    };
  }, [token, toast]);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.id, (rows ?? []).filter((r) => matchesFilter(r, f.id)).length])) as Record<Filter, number>,
    [rows],
  );

  const results = useMemo(() => {
    const scored = (rows ?? []).filter((r) => matchesFilter(r, filter)).map((r) => ({ r, s: score(r, query) })).filter((x) => x.s > 0);
    return (query ? scored.sort((a, b) => b.s - a.s) : scored).map((x) => x.r);
  }, [rows, filter, query]);

  // Recomendaciones al escribir: lo mejor de TODAS las salas (aunque estén en otro filtro), para no perder nada.
  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    return (rows ?? [])
      .map((r) => ({ r, s: score(r, query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 5)
      .map((x) => x.r);
  }, [rows, query]);

  // Sin resultados: lo más parecido, con tolerancia, para que la búsqueda no termine en vacío.
  const didYouMean = useMemo(() => {
    if (!query.trim() || results.length > 0) return [];
    const q = norm(query);
    return (rows ?? [])
      .map((r) => ({ r, d: distance(q, norm(r.merchant ?? "shared bill").slice(0, Math.max(q.length, 3))) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map((x) => x.r);
  }, [rows, query, results.length]);

  async function archive(r: RoomRow, archived: boolean) {
    if (!token) return;
    const stamp = archived ? new Date().toISOString() : null;
    setRows((rs) => rs && rs.map((x) => (x.code === r.code ? { ...x, archivedAt: stamp } : x))); // optimista
    try {
      const res = await fetch(`/api/rooms/${r.code}/archive`, {
        method: "POST",
        headers: { "x-session": token, "content-type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      if (!res.ok) throw new Error();
      toast({ tone: "ok", title: archived ? "Archived" : "Back in your list", body: r.merchant ?? r.code });
    } catch {
      setRows((rs) => rs && rs.map((x) => (x.code === r.code ? { ...x, archivedAt: r.archivedAt } : x)));
      toast({ tone: "error", title: "Couldn't update it", body: "Please try again." });
    }
  }

  if (session === undefined) return <PageSkeleton />;

  if (!session) {
    return (
      <section className="stagger">
        <p className="font-mono text-[11px] uppercase tracking-wide text-muted">Your bills</p>
        <h1 className="display mt-2 text-5xl sm:text-6xl">Pick up where you left off.</h1>
        <p className="mb-8 mt-4 text-[15px] leading-relaxed text-muted">
          Enter your email and we&apos;ll send you a sign-in link — no password. You&apos;ll see every bill you started, from any device.
        </p>
        <EmailLogin redirectPath="/rooms" />
      </section>
    );
  }

  const money = (c: number, cur: Currency) => formatMoney(c, cur, "en-US");
  const visible = results.slice(0, shown);
  const open = focus && suggestions.length > 0;

  return (
    <section className="stagger">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-wide text-muted">Your bills</p>
          <p translate="no" className="mt-1 truncate text-sm text-muted">{session.user.email}</p>
        </div>
        <button
          type="button"
          onClick={() => void supabaseBrowser().auth.signOut()}
          className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-sm transition-colors hover:bg-paper-2"
        >
          <LogOut aria-hidden className="size-4" /> Sign out
        </button>
      </div>
      <h1 className="display mt-3 text-5xl sm:text-6xl">What&apos;s been collected.</h1>

      {rows === null && <div className="skeleton mt-8 h-32 rounded-3xl" aria-label="Loading bills" />}

      {rows !== null && rows.length === 0 && (
        <p className="mt-8 rounded-3xl bg-paper-2 p-6 text-[15px] leading-relaxed text-muted">No bills yet. Split your first one and it will show up here.</p>
      )}

      {rows !== null && rows.length > 0 && (
        <>
          {/* búsqueda con recomendaciones */}
          <div className="relative mt-8">
            <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded={open}
              aria-controls="bill-suggestions"
              aria-autocomplete="list"
              aria-label="Search your bills"
              value={query}
              placeholder="Search by name, code or date"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                setQuery(e.target.value);
                setCursor(-1);
                setShown(PAGE);
              }}
              onFocus={() => setFocus(true)}
              onBlur={() => window.setTimeout(() => setFocus(false), 120)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setCursor((c) => Math.min(c + 1, suggestions.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setCursor((c) => Math.max(c - 1, -1));
                } else if (e.key === "Enter" && cursor >= 0) {
                  e.preventDefault();
                  setQuery(suggestions[cursor].merchant ?? suggestions[cursor].code);
                  setFocus(false);
                } else if (e.key === "Escape") {
                  setFocus(false);
                }
              }}
              className="w-full rounded-full border border-line bg-paper py-3 pl-11 pr-11 text-[15px] outline-none transition-colors placeholder:text-faint hover:bg-paper-2 focus:border-accent"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted transition-colors hover:bg-paper-3 hover:text-ink"
              >
                <X aria-hidden className="size-4" />
              </button>
            )}
            {open && (
              <ul
                id="bill-suggestions"
                role="listbox"
                className="pop-in absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-3xl border border-line bg-paper shadow-[0_20px_40px_-20px_#171412a0]"
              >
                {suggestions.map((s, i) => (
                  <li key={s.code} role="option" aria-selected={i === cursor}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setQuery(s.merchant ?? s.code);
                        setFocus(false);
                      }}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${i === cursor ? "bg-paper-2" : "hover:bg-paper-2"}`}
                    >
                      <span className="min-w-0 truncate text-[15px]">{s.merchant ?? "Shared bill"}</span>
                      <span translate="no" className="shrink-0 font-mono text-[11px] uppercase text-muted">
                        {s.code} · {STATUS_LABEL[s.status] ?? s.status}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* filtros */}
          <div role="tablist" aria-label="Filter bills" className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => {
                  setFilter(f.id);
                  setShown(PAGE);
                }}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm transition-colors ${
                  filter === f.id ? "border-ink bg-ink text-paper" : "border-line hover:bg-paper-2"
                }`}
              >
                {f.label} <span translate="no" className={filter === f.id ? "text-paper/60" : "text-muted"}>{counts[f.id]}</span>
              </button>
            ))}
          </div>

          <p role="status" className="mt-4 font-mono text-[11px] uppercase tracking-wide text-muted">
            {results.length} {results.length === 1 ? "bill" : "bills"}
            {query ? ` for “${query}”` : ""}
          </p>

          {results.length === 0 && (
            <div className="mt-4 rounded-3xl bg-paper-2 p-6 text-[15px] leading-relaxed">
              <p className="text-muted">
                {query ? (
                  <>Nothing matches <strong className="font-semibold text-ink">“{query}”</strong> in {FILTERS.find((f) => f.id === filter)?.label.toLowerCase()}.</>
                ) : filter === "archived" ? (
                  "Nothing archived. Archive old bills to keep your list short."
                ) : (
                  "Nothing here yet."
                )}
              </p>
              {query && didYouMean.length > 0 && (
                <div className="mt-4">
                  <p className="font-mono text-[11px] uppercase tracking-wide text-muted">Did you mean</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {didYouMean.map((r) => (
                      <button
                        key={r.code}
                        type="button"
                        onClick={() => {
                          setQuery(r.merchant ?? r.code);
                          if (!matchesFilter(r, filter)) setFilter(r.archivedAt ? "archived" : "all");
                        }}
                        className="rounded-full border border-line bg-paper px-3.5 py-1.5 text-sm transition-colors hover:bg-paper-3"
                      >
                        {r.merchant ?? r.code}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                  className="mt-4 text-sm underline underline-offset-4 hover:text-accent"
                >
                  Clear search and filters
                </button>
              )}
            </div>
          )}

          <ul className="mt-4 space-y-3">
            {visible.map((r) => (
              <li key={r.code} className="relative">
                <Link href={`/r/${r.code}/host`} className="block rounded-3xl border border-line bg-paper-2 p-5 pr-16 transition-colors hover:bg-paper-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[17px]">
                        {r.merchant ?? "Shared bill"}
                        {r.merchant?.includes("(demo)") && <span className="ml-2 align-middle font-mono text-[10px] uppercase text-muted">demo</span>}
                      </p>
                      <p translate="no" className="font-mono text-xs text-muted">
                        {r.code} · {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1 font-mono text-[11px] uppercase ${TONE[r.status] ?? "bg-paper-3"}`}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-wide text-muted">Collected</p>
                      <p translate="no" className="font-mono text-2xl tabular-nums">
                        {money(r.collectedCents, r.currency)}
                        <span className="text-base text-muted"> / {money(r.totalCents, r.currency)}</span>
                      </p>
                      {r.heldCents > 0 && <p translate="no" className="mt-0.5 font-mono text-xs text-muted">{money(r.heldCents, r.currency)} on hold</p>}
                    </div>
                    <span className="flex items-center gap-2 text-sm text-muted">
                      {r.confirmed}/{r.payers} confirmed <ArrowUpRight aria-hidden className="size-4" />
                    </span>
                  </div>
                </Link>
                <button
                  type="button"
                  aria-label={r.archivedAt ? `Restore ${r.merchant ?? r.code}` : `Archive ${r.merchant ?? r.code}`}
                  title={r.archivedAt ? "Restore" : "Archive"}
                  onClick={() => void archive(r, !r.archivedAt)}
                  className="absolute right-4 top-14 grid size-9 place-items-center rounded-full border border-line bg-paper text-muted transition-colors hover:bg-paper-3 hover:text-ink"
                >
                  {r.archivedAt ? <ArchiveRestore aria-hidden className="size-4" /> : <Archive aria-hidden className="size-4" />}
                </button>
              </li>
            ))}
          </ul>

          {results.length > shown && (
            <div className="mt-6 flex justify-center">
              <Button variant="ghost" onClick={() => setShown((n) => n + PAGE)}>
                Show more ({results.length - shown} left)
              </Button>
            </div>
          )}
        </>
      )}

      <div className="mt-8">
        <Link href="/new" className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 text-[15px] text-paper transition-colors hover:bg-accent">
          <Plus aria-hidden className="size-4" /> Split a new bill
        </Link>
      </div>
    </section>
  );
}
