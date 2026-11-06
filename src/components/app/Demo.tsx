"use client";

import { Dices, Receipt } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { saveMyToken, saveRoom } from "@/components/app/my-rooms";
import { Button } from "@/components/ui/Button";

type Mode = "fair" | "lucky";

const CHOICES: { mode: Mode; icon: typeof Receipt; title: string; text: string; tag: string }[] = [
  {
    mode: "fair",
    icon: Receipt,
    title: "Split fair",
    text: "The classic. Three friends already tapped what they had. You pay your part, last.",
    tag: "Everyone pays their share",
  },
  {
    mode: "lucky",
    icon: Dices,
    title: "Feeling lucky",
    text: "A game between friends. Everyone says yes, a card is drawn, and one person pays it all.",
    tag: "One pays it all",
  },
];

/** Elige que demo ver y arma una mesa de ejemplo (amigos simulados). Quien prueba paga la ultima parte. */
export function Demo() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [failed, setFailed] = useState(false);

  const start = useCallback(async (m: Mode) => {
    setMode(m);
    setFailed(false);
    try {
      const res = await fetch("/api/demo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: m }) });
      if (!res.ok) throw new Error();
      const d = (await res.json()) as { code: string; hostUrl: string; myToken: string; tablePath: string };
      saveMyToken(d.code, d.myToken);
      saveRoom({ code: d.code, hostPath: d.hostUrl.replace(/^https?:\/\/[^/]+/, ""), merchant: "Trattoria Quorum (demo)", createdAt: Date.now() });
      router.replace(d.tablePath);
    } catch {
      setFailed(true);
      setMode(null);
    }
  }, [router]);

  const busy = mode !== null;

  return (
    <section className="stagger">
      <p className="font-mono text-[11px] uppercase tracking-wide text-muted">Demo</p>
      <h1 className="display mt-2 text-5xl sm:text-6xl">{busy ? "Setting the table…" : "Pick your demo."}</h1>
      <p className="mt-4 text-[15px] leading-relaxed text-muted">
        {busy
          ? "We're seating three friends and bringing the bill. One moment."
          : "Same table, two ways to split it. No sign-up. You play the last person to pay, with a PayPal Sandbox account — nothing real is charged."}
      </p>

      {failed && (
        <p role="alert" className="mt-4 rounded-2xl bg-danger/10 p-4 text-sm text-danger">
          Something went wrong creating the demo. Try again in a moment.
        </p>
      )}

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {CHOICES.map((c) => (
          <button
            key={c.mode}
            type="button"
            disabled={busy}
            onClick={() => void start(c.mode)}
            className={`group flex flex-col items-start gap-3 rounded-3xl border p-5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait ${
              mode === c.mode ? "border-accent bg-accent-soft" : "border-line bg-paper-2 hover:border-accent hover:bg-paper-3"
            } ${busy && mode !== c.mode ? "opacity-50" : ""}`}
          >
            <span className="grid size-11 place-items-center rounded-full bg-ink text-paper transition-colors group-hover:bg-accent">
              <c.icon aria-hidden className="size-5" />
            </span>
            <span className="display text-3xl">{c.title}</span>
            <span className="text-[15px] leading-relaxed text-muted">{c.text}</span>
            <span className="mt-1 font-mono text-[11px] uppercase tracking-wide">{c.tag}</span>
          </button>
        ))}
      </div>
      {failed && (
        <div className="mt-6">
          <Button variant="ghost" onClick={() => setFailed(false)}>Dismiss</Button>
        </div>
      )}
    </section>
  );
}
