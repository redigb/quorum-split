"use client";

import { Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { sendMagicLink } from "@/lib/auth-client";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";

/** Acceso por correo, sin contraseña. Campo propio (sin type=email nativo ni su validación del navegador). */
export function EmailLogin({ redirectPath, cta = "Email me a link" }: { redirectPath: string; cta?: string }) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [wait, setWait] = useState(0); // segundos de espera: cada reintento gasta el cupo de correos de Supabase

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      toast({ tone: "error", title: "That email doesn't look right" });
      return;
    }
    if (wait > 0) return;
    setBusy(true);
    try {
      await sendMagicLink(value, redirectPath);
      setSentTo(value);
      setWait(60);
    } catch (err) {
      const rate = err instanceof Error && /rate|limit|seconds/i.test(err.message);
      if (rate) setWait(60);
      toast({
        tone: "error",
        title: rate ? "Too many emails right now" : "Couldn't send the link",
        body: rate ? "Too many emails were requested. Wait a minute and try again." : "Check the address and try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <div role="status" className="rounded-2xl bg-accent-soft p-4 text-[15px] leading-relaxed">
        <p className="font-semibold">Check your email.</p>
        <p className="mt-1 text-muted">
          We sent a link to <span translate="no" className="text-ink">{sentTo}</span>. Open it on this device to continue.
        </p>
        <button
          type="button"
          onClick={() => setSentTo(null)}
          className="mt-3 text-sm underline underline-offset-4 hover:text-accent"
        >
          Use another email
        </button>
        {wait > 0 && <p className="mt-2 font-mono text-[11px] uppercase tracking-wide text-muted">You can resend in {wait}s</p>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="you@email.com"
        aria-label="Email"
        className="min-w-0 flex-1 rounded-2xl border border-line bg-paper px-4 py-3 text-[15px] outline-none transition-colors placeholder:text-faint hover:bg-paper-2 focus:border-accent"
      />
      <Button type="submit" busy={busy} disabled={wait > 0}>
        <Mail aria-hidden className="size-4" /> {wait > 0 ? `Wait ${wait}s` : cta}
      </Button>
    </form>
  );
}
