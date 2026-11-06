"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

interface Options {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" pinta la acción en rojo (cancelar sala, anular, etc.). */
  tone?: "default" | "danger";
}
type Ask = (o: Options) => Promise<boolean>;

const Ctx = createContext<Ask | null>(null);

/** Reemplaza a window.confirm(): `if (await confirm({...})) { ... }` */
export function useConfirm(): Ask {
  const ask = useContext(Ctx);
  if (!ask) throw new Error("useConfirm requiere <ConfirmProvider>");
  return ask;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<Options | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const ask = useCallback<Ask>((o) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = useCallback((answer: boolean) => {
    resolver.current?.(answer);
    resolver.current = null;
    setOpts(null);
  }, []);

  useEffect(() => {
    if (!opts) return;
    cancelRef.current?.focus(); // lo seguro es el foco por defecto
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [opts, close]);

  return (
    <Ctx.Provider value={ask}>
      {children}
      {opts && (
        <div className="fixed inset-0 z-[110] grid place-items-end p-4 sm:place-items-center">
          <button
            type="button"
            aria-label="Close"
            tabIndex={-1}
            onClick={() => close(false)}
            className="fade-in absolute inset-0 bg-ink/45 backdrop-blur-sm"
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby={opts.body ? "confirm-body" : undefined}
            className="sheet-in relative w-full max-w-sm rounded-3xl border border-line bg-paper p-6 shadow-2xl"
          >
            <h2 id="confirm-title" className="display text-3xl">
              {opts.title}
            </h2>
            {opts.body && (
              <p id="confirm-body" className="mt-3 text-[15px] leading-relaxed text-muted">
                {opts.body}
              </p>
            )}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                ref={cancelRef}
                type="button"
                onClick={() => close(false)}
                className="rounded-full border border-line px-5 py-3 text-sm transition-colors hover:bg-paper-2"
              >
                {opts.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => close(true)}
                className={`rounded-full px-5 py-3 text-sm text-paper transition-colors ${
                  opts.tone === "danger" ? "bg-danger hover:bg-ink" : "bg-ink hover:bg-accent"
                }`}
              >
                {opts.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
