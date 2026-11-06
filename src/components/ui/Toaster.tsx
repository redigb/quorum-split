"use client";

import { AlertCircle, Check, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type Tone = "ok" | "error" | "info";
interface Toast {
  id: number;
  tone: Tone;
  title: string;
  body?: string;
}
type Notify = (t: { tone?: Tone; title: string; body?: string; ms?: number }) => void;

const Ctx = createContext<Notify | null>(null);

/** Avisos propios de la app (reemplazan a alert() y a los mensajes nativos del navegador). */
export function useToast(): Notify {
  const n = useContext(Ctx);
  if (!n) throw new Error("useToast requiere <Toaster>");
  return n;
}

const ICON = { ok: Check, error: AlertCircle, info: Info } as const;
const DOT = { ok: "bg-ok text-paper", error: "bg-danger text-paper", info: "bg-accent text-paper" } as const;

export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const notify = useCallback<Notify>(
    ({ tone = "info", title, body, ms = 4500 }) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-2), { id, tone, title, body }]); // máx. 3 visibles
      window.setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );
  const value = useMemo(() => notify, [notify]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => {
          const Icon = ICON[t.tone];
          return (
            <div
              key={t.id}
              role={t.tone === "error" ? "alert" : "status"}
              className="toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-line bg-ink py-3 pl-3 pr-2 text-paper shadow-xl"
            >
              <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${DOT[t.tone]}`}>
                <Icon aria-hidden className="size-3.5" strokeWidth={3} />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold">{t.title}</p>
                {t.body && <p className="mt-0.5 text-paper/70">{t.body}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="grid size-7 shrink-0 place-items-center rounded-full text-paper/60 transition-colors hover:bg-paper/10 hover:text-paper"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
