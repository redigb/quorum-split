"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ConfirmProvider } from "@/components/ui/Confirm";
import { Toaster } from "@/components/ui/Toaster";

/** Marco común de las pantallas de la app: mismos tokens que la landing, sin controles nativos. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <Toaster>
      <ConfirmProvider>
        <div className="min-h-dvh bg-paper">
          <header className="mx-auto flex max-w-xl items-center justify-between px-5 pt-5">
            <Link href="/" translate="no" className="display text-2xl tracking-tight" aria-label="Quorum, home">
              QUORUM<span className="text-accent">.</span>
            </Link>
            <nav aria-label="App" className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-wide text-muted">
              <Link href="/rooms" className="transition-colors hover:text-ink">Your rooms</Link>
              <span aria-hidden>·</span>
              <span>Sandbox</span>
            </nav>
          </header>
          <main className="mx-auto max-w-xl px-5 pb-24 pt-8">{children}</main>
        </div>
      </ConfirmProvider>
    </Toaster>
  );
}
