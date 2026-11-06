"use client";

import { ArrowUpRight, LogOut, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatMoney, type Currency } from "@/core/money";
import { claimLocalRooms } from "@/components/app/my-rooms";
import { EmailLogin } from "@/components/app/EmailLogin";
import { STATUS_LABEL } from "@/components/app/status";
import { useToast } from "@/components/ui/Toaster";
import { supabaseBrowser, useSession } from "@/lib/auth-client";
import { PageSkeleton } from "@/components/ui/Skeleton";

interface RoomRow {
  code: string;
  status: string;
  merchant: string | null;
  currency: Currency;
  createdAt: string;
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

export function Rooms() {
  const session = useSession();
  const toast = useToast();
  const [rows, setRows] = useState<RoomRow[] | null>(null);
  const token = session?.access_token;

  useEffect(() => {
    if (!token) return;
    let off = false;
    (async () => {
      // Primero reclamamos las salas creadas en este dispositivo; luego listamos todas.
      const claimed = await claimLocalRooms(token);
      if (claimed > 0 && !off) toast({ tone: "ok", title: `${claimed} room${claimed > 1 ? "s" : ""} saved to your account` });
      try {
        const res = await fetch("/api/me/rooms", { headers: { "x-session": token }, cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { rooms: RoomRow[] };
        if (!off) setRows(data.rooms);
      } catch {
        if (!off) toast({ tone: "error", title: "Couldn't load your rooms", body: "Reload the page to try again." });
      }
    })();
    return () => {
      off = true;
    };
  }, [token, toast]);

  if (session === undefined) return <PageSkeleton />;

  if (!session) {
    return (
      <section className="stagger">
        <p className="font-mono text-[11px] uppercase tracking-wide text-muted">Your rooms</p>
        <h1 className="display mt-2 text-5xl sm:text-6xl">Pick up where you left off.</h1>
        <p className="mb-8 mt-4 text-[15px] leading-relaxed text-muted">
          Enter your email and we&apos;ll send you a sign-in link — no password. You&apos;ll see every bill you started, from any device.
        </p>
        <EmailLogin redirectPath="/rooms" />
      </section>
    );
  }

  const money = (c: number, cur: Currency) => formatMoney(c, cur, "en-US");

  return (
    <section className="stagger">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-wide text-muted">Your rooms</p>
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

      {rows === null && <div className="mt-8 h-32 animate-pulse rounded-3xl bg-paper-2" aria-label="Loading rooms" />}

      {rows?.length === 0 && (
        <p className="mt-8 rounded-3xl bg-paper-2 p-6 text-[15px] leading-relaxed text-muted">
          No rooms yet. Split your first bill and it will show up here.
        </p>
      )}

      <ul className="mt-8 space-y-3">
        {rows?.map((r) => (
          <li key={r.code}>
            <Link
              href={`/r/${r.code}/host`}
              className="block rounded-3xl border border-line bg-paper-2 p-5 transition-colors hover:bg-paper-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[17px]">{r.merchant ?? "Shared bill"}</p>
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
                  {r.heldCents > 0 && (
                    <p translate="no" className="mt-0.5 font-mono text-xs text-muted">{money(r.heldCents, r.currency)} on hold</p>
                  )}
                </div>
                <span className="flex items-center gap-2 text-sm text-muted">
                  {r.confirmed}/{r.payers} confirmed <ArrowUpRight aria-hidden className="size-4" />
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <Link href="/new" className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 text-[15px] text-paper transition-colors hover:bg-accent">
          <Plus aria-hidden className="size-4" /> Split a new bill
        </Link>
      </div>
    </section>
  );
}
