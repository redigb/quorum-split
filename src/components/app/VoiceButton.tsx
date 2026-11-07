"use client";

import { Loader2, Mic, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toaster";

const MAX_SECONDS = 30;
const MIME = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];

type Note = { tone: "ok" | "info" | "error"; title: string; body?: string };

const ERRORS: Record<string, string> = {
  no_speech: "We didn't hear anything. Try again a bit closer to the mic.",
  audio_too_long: "That was too long. Keep it under 30 seconds.",
  unreadable_proposal: "We couldn't match that to the items. Say the dish names, or tap them instead.",
  unreadable_dictation: "We couldn't find items with prices in that. Say each dish with its price: “two pizzas at twenty each and a beer, ten” / “dos pizzas a veinte y una cerveza a diez”.",
  rate_limited: "Too many tries in a row. Wait a minute and try again.",
  not_available: "The table changed mode. Reload the page.",
};

/** Qué decirle a quien habló, según lo que respondió el servidor al asignar ítems en una mesa. */
export function describeAssignment(data: { transcript: string; changed: number }): Note {
  if (data.changed === 0) return { tone: "info", title: `We heard: “${data.transcript}”`, body: "Nothing changed. Mention the dish names, like “I had the carbonara”." };
  return { tone: "ok", title: `Done — ${data.changed} change${data.changed > 1 ? "s" : ""}`, body: `We heard: “${data.transcript}”` };
}

/**
 * Modo de voz: una nota corta (máx. 30 s) que se envía a `url` y se transcribe. Sirve para marcar ítems en una mesa
 * y para dictar la cuenta al crearla. Botón propio (sin controles nativos); `getHeaders` entrega el token de quien habla.
 */
export function VoiceButton({
  url,
  getHeaders,
  fields,
  describe,
  onDone,
  label = "Tell us what you had",
}: {
  url: string;
  getHeaders: () => Promise<Record<string, string>>;
  fields?: Record<string, string>;
  describe: (data: never) => Note;
  onDone: (data: never) => void;
  label?: string;
}) {
  const toast = useToast();
  const [state, setState] = useState<"idle" | "recording" | "sending">("idle");
  const [secs, setSecs] = useState(0);
  const [lang, setLang] = useState<"es" | "en">("en");
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const stream = useRef<MediaStream | null>(null);

  const cleanup = useCallback(() => {
    window.clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);
  useEffect(() => cleanup, [cleanup]);

  async function send(blob: Blob) {
    setState("sending");
    try {
      const form = new FormData();
      form.set("audio", new File([blob], "voice", { type: blob.type }));
      for (const [k, v] of Object.entries(fields ?? {})) form.set(k, v);
      form.set("lang", lang);
      const res = await fetch(url, { method: "POST", headers: await getHeaders(), body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const heard = typeof data.transcript === "string" && data.transcript ? ` We heard: “${data.transcript}”.` : "";
        toast({ tone: "error", title: "Couldn't use that", body: (ERRORS[data.error] ?? "Please try again, or tap the items.") + heard });
      } else {
        const note = describe(data as never);
        toast(note);
        if (note.tone === "ok") onDone(data as never);
      }
    } catch {
      toast({ tone: "error", title: "Couldn't send it", body: "Check your connection and try again." });
    } finally {
      setState("idle");
    }
  }

  async function start() {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast({ tone: "error", title: "Voice isn't available here", body: "Your browser can't record. Tap the items instead." });
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast({ tone: "error", title: "Microphone blocked", body: "Allow the microphone in your browser to use your voice." });
      return;
    }
    const mimeType = MIME.find((m) => MediaRecorder.isTypeSupported(m));
    const r = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined);
    chunks.current = [];
    r.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
    r.onstop = () => {
      cleanup();
      const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
      if (blob.size < 1000) {
        setState("idle");
        toast({ tone: "info", title: "Too short", body: "Hold on a little longer and say what you had." });
        return;
      }
      void send(blob);
    };
    rec.current = r;
    r.start();
    setSecs(0);
    setState("recording");
    timer.current = window.setInterval(() => {
      setSecs((s) => {
        if (s + 1 >= MAX_SECONDS && r.state === "recording") r.stop();
        return s + 1;
      });
    }, 1000);
  }

  function stop() {
    if (rec.current?.state === "recording") rec.current.stop();
  }

  const recording = state === "recording";
  return (
    <div>
    <button
      type="button"
      disabled={state === "sending"}
      aria-pressed={recording}
      onClick={() => (recording ? stop() : void start())}
      className={`inline-flex w-full items-center justify-center gap-2.5 rounded-full border px-5 py-3.5 text-[15px] transition-[background-color,transform] duration-200 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait ${
        recording ? "border-danger bg-danger/10 text-danger" : "border-line bg-paper hover:bg-paper-2"
      }`}
    >
      <span className="relative grid size-5 place-items-center">
        {/* los tres íconos siempre montados: así el traductor del navegador no rompe el DOM */}
        <Mic aria-hidden className={`size-5 ${state === "idle" ? "" : "hidden"}`} />
        <Square aria-hidden className={`size-4 fill-current ${recording ? "" : "hidden"}`} />
        <Loader2 aria-hidden className={`size-5 animate-spin ${state === "sending" ? "" : "hidden"}`} />
      </span>
      <span translate="no">
        {recording ? `Listening… ${secs}s · tap to send` : state === "sending" ? "Understanding…" : label}
      </span>
    </button>
    <div role="group" aria-label="Spoken language" className="mt-2 flex items-center justify-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-muted">
      <span>Language</span>
      {(["en", "es"] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          disabled={state !== "idle"}
          onClick={() => setLang(l)}
          className={`rounded-full px-2.5 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-accent ${lang === l ? "bg-ink text-paper" : "hover:bg-paper-3"}`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
    </div>
  );
}
