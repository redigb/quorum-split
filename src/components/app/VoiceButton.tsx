"use client";

import { Check, Loader2, Mic, Square, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toaster";

const MAX_SECONDS = 30;
const MIME = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
const BARS = 14;

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
  if (data.changed === 0) return { tone: "info", title: "Nothing changed", body: "Mention the dish names, like “I had the carbonara”." };
  return { tone: "ok", title: `Done — ${data.changed} change${data.changed > 1 ? "s" : ""}`, body: "Your items are updated in the list below." };
}

/** Reconocimiento en vivo del navegador: solo para mostrar lo que se va diciendo; el texto que cuenta lo transcribe el servidor. */
type LiveRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

/**
 * Modo de voz: una nota corta (máx. 30 s) que se envía a `url` y se transcribe. Sirve para marcar ítems en una mesa
 * y para dictar la cuenta al crearla. Botón propio (sin controles nativos); `getHeaders` entrega el token de quien habla.
 *
 * Mientras se habla se ve: el nivel de la voz (barras), lo que va entendiendo el navegador (si lo soporta) y el tiempo.
 * Al enviar, los pasos (transcribir, interpretar) y después, fijo en pantalla, lo que se entendió.
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
  const [live, setLive] = useState("");
  const [step, setStep] = useState<"transcribing" | "understanding">("transcribing");
  const [last, setLast] = useState<{ tone: Note["tone"]; heard?: string; title: string; body?: string } | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const stream = useRef<MediaStream | null>(null);
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const raf = useRef(0);
  const audioCtx = useRef<AudioContext | null>(null);
  const recog = useRef<LiveRecognition | null>(null);
  const heard = useRef("");

  const cleanup = useCallback(() => {
    window.clearInterval(timer.current);
    cancelAnimationFrame(raf.current);
    try {
      recog.current?.stop();
    } catch {
      /* ya estaba detenido */
    }
    recog.current = null;
    void audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);
  useEffect(() => cleanup, [cleanup]);

  async function send(blob: Blob) {
    setState("sending");
    setStep("transcribing");
    const t = window.setTimeout(() => setStep("understanding"), 1800);
    try {
      const form = new FormData();
      form.set("audio", new File([blob], "voice", { type: blob.type }));
      for (const [k, v] of Object.entries(fields ?? {})) form.set(k, v);
      form.set("lang", lang);
      const res = await fetch(url, { method: "POST", headers: await getHeaders(), body: form });
      const data = await res.json().catch(() => ({}));
      const said = typeof data.transcript === "string" && data.transcript ? data.transcript : heard.current || undefined;
      if (!res.ok) {
        const msg = ERRORS[data.error] ?? "Please try again, or tap the items.";
        setLast({ tone: "error", heard: said, title: "Couldn't use that", body: msg });
      } else {
        const note = describe(data as never);
        setLast({ tone: note.tone, heard: said, title: note.title, body: note.body });
        if (note.tone === "ok") onDone(data as never);
      }
    } catch {
      setLast({ tone: "error", title: "Couldn't send it", body: "Check your connection and try again." });
    } finally {
      window.clearTimeout(t);
      setState("idle");
    }
  }

  /** Barras que siguen el volumen de la voz (por DOM directo: nada de re-renderizar 60 veces por segundo). */
  function meter(s: MediaStream) {
    try {
      const ctx = new AudioContext();
      audioCtx.current = ctx;
      const an = ctx.createAnalyser();
      an.fftSize = 64;
      ctx.createMediaStreamSource(s).connect(an);
      const data = new Uint8Array(an.frequencyBinCount);
      const tick = () => {
        an.getByteFrequencyData(data);
        for (let i = 0; i < BARS; i++) {
          const v = data[Math.min(data.length - 1, Math.floor((i / BARS) * data.length * 0.7))] / 255;
          const el = bars.current[i];
          if (el) el.style.transform = `scaleY(${Math.max(0.12, v)})`;
        }
        raf.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      /* sin medidor: se graba igual */
    }
  }

  /** Subtítulos en vivo con el reconocimiento del navegador (Chrome, Edge, Safari). Es solo una ayuda visual. */
  function captions() {
    const w = window as unknown as { SpeechRecognition?: new () => LiveRecognition; webkitSpeechRecognition?: new () => LiveRecognition };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    try {
      const r = new Ctor();
      r.lang = lang === "es" ? "es-ES" : "en-US";
      r.continuous = true;
      r.interimResults = true;
      r.onresult = (e) => {
        let text = "";
        for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript + " ";
        heard.current = text.trim();
        setLive(heard.current);
      };
      r.onerror = () => {};
      r.start();
      recog.current = r;
    } catch {
      /* sin subtítulos */
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
    heard.current = "";
    setLive("");
    setLast(null);
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
    meter(stream.current);
    captions();
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
  const sending = state === "sending";
  return (
    <div>
      <button
        type="button"
        disabled={sending}
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
          <Loader2 aria-hidden className={`size-5 animate-spin ${sending ? "" : "hidden"}`} />
        </span>
        <span translate="no">
          {recording ? `Stop and send · ${secs}s` : sending ? (step === "transcribing" ? "Writing down what you said…" : "Working out who had what…") : label}
        </span>
      </button>

      {/* Mientras habla: nivel de voz y lo que se va entendiendo */}
      <div
        aria-live="polite"
        className={`overflow-hidden rounded-3xl bg-ink text-paper transition-[max-height,opacity,margin] duration-300 ${
          recording || sending ? "mt-3 max-h-60 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="p-4">
          <div className="flex h-10 items-center justify-center gap-1" aria-hidden>
            {Array.from({ length: BARS }, (_, i) => (
              <span
                key={i}
                ref={(el) => {
                  bars.current[i] = el;
                }}
                className={`h-full w-1.5 origin-center rounded-full ${recording ? "bg-[#a99cff]" : "bg-paper/25"}`}
                style={{ transform: "scaleY(0.12)", transition: "transform 80ms linear" }}
              />
            ))}
          </div>
          <p translate="no" className="mt-3 min-h-12 text-center text-[15px] leading-snug">
            {live ? (
              <>“{live}”</>
            ) : recording ? (
              <span className="text-paper/60">Listening… say each dish with its price.</span>
            ) : (
              <span className="text-paper/60">One moment…</span>
            )}
          </p>
          <p className="mt-1 text-center font-mono text-[10px] uppercase tracking-wide text-paper/40">
            {recording ? `${Math.max(0, MAX_SECONDS - secs)}s left · tap the button when you're done` : "Don't close this page"}
          </p>
        </div>
      </div>

      {/* Después: lo que se entendió, fijo en pantalla (el aviso desaparece; esto no) */}
      {last && state === "idle" && (
        <div
          role="status"
          className={`mt-3 rounded-3xl border p-4 text-[15px] leading-relaxed ${last.tone === "error" ? "border-danger/30 bg-danger/10" : "border-line bg-paper-2"}`}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="flex items-center gap-2 font-semibold">
              <span className="relative grid size-4 place-items-center">
                <Check aria-hidden className={`size-4 text-ok ${last.tone === "ok" ? "" : "hidden"}`} />
                <X aria-hidden className={`size-4 text-danger ${last.tone === "error" ? "" : "hidden"}`} />
                <Mic aria-hidden className={`size-4 text-muted ${last.tone === "info" ? "" : "hidden"}`} />
              </span>
              <span translate="no">{last.title}</span>
            </p>
            <button type="button" aria-label="Dismiss" onClick={() => setLast(null)} className="rounded-full p-1 text-muted hover:bg-paper-3">
              <X aria-hidden className="size-4" />
            </button>
          </div>
          {last.body && (
            <p translate="no" className="mt-1 text-muted">
              {last.body}
            </p>
          )}
          {last.heard && (
            <p translate="no" className="mt-2 border-t border-line pt-2 text-sm text-muted">
              You said: “{last.heard}”
            </p>
          )}
        </div>
      )}

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
