"use client";

import { Check, Clock, Dices, RotateCcw, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PEOPLE, SPLIT, localLabel, money, shareOf } from "./demo-bill";
import { EASE, MOTION_OK, gsap, useGSAP } from "./gsap";
import { LuckyDraw } from "./LuckyDraw";
import { Note } from "./Note";

type Phase = "collecting" | "captured" | "expired" | "drawing" | "drawn";
type Mode = "fair" | "lucky";
type LogTone = "hold" | "ok" | "void";
interface LogItem {
  id: number;
  who: string;
  event: string;
  detail: string;
  tone: LogTone;
}

const SIZE = 360;
const C = SIZE / 2;
const R = 150;
const STROKE = 14;
const CIRC = 2 * Math.PI * R;
const SEG = CIRC / PEOPLE.length;
const GAP = 12;
const GREEN = "#3ecf8e"; // verde "confirmado" legible sobre fondo oscuro
const HOLD = "#ffc765";
const TOTAL = SPLIT.grandTotalCents;
const DEADLINE_S = 24 * 3600 - 19; // 23:59:41

const angleOf = (i: number) => ((i + 0.5) / PEOPLE.length) * 2 * Math.PI - Math.PI / 2;
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const pad = (n: number) => String(n).padStart(2, "0");

/** Reloj del plazo: componente aparte para no re-renderizar toda la escena cada segundo. */
function Countdown({ running }: { running: boolean }) {
  const [left, setLeft] = useState(DEADLINE_S);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [running]);
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  return (
    <span className="num">
      {pad(h)}:{pad(m)}:{pad(left % 60)}
    </span>
  );
}

export function QuorumDemo() {
  const root = useRef<HTMLElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const vault = useRef<HTMLDivElement>(null);
  const amountEl = useRef<HTMLParagraphElement>(null);
  const counter = useRef({ v: 0 });
  const logId = useRef(0);

  const [authorized, setAuthorized] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>("collecting");
  const [log, setLog] = useState<LogItem[]>([]);
  const [mode, setMode] = useState<Mode>("fair");
  const [winner, setWinner] = useState(0);
  const lucky = mode === "lucky";

  const done = authorized.length;
  const total = PEOPLE.length;
  const held = lucky ? 0 : authorized.reduce((acc, id) => acc + shareOf(id), 0);
  const drawPhase = phase === "drawing" || phase === "drawn";
  const fill = phase === "expired" ? 0 : lucky ? Math.round((done / total) * 100) : Math.round((held / TOTAL) * 100);
  const shown = phase === "captured" || drawPhase ? TOTAL : phase === "expired" ? 0 : lucky ? TOTAL : held;

  const push = (who: string, event: string, detail: string, tone: LogTone) =>
    setLog((l) => [{ id: ++logId.current, who, event, detail, tone }, ...l].slice(0, 4));

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        // Órbita lenta: el anillo gira, las caras se mantienen derechas
        const spin = gsap.to(".orbit", {
          rotation: 360,
          duration: 90,
          repeat: -1,
          ease: "none",
        });
        const counterSpin = gsap.to(".orbit-face", {
          rotation: -360,
          duration: 90,
          repeat: -1,
          ease: "none",
        });
        const orbit = wrap.current!;
        const pause = () => (spin.pause(), counterSpin.pause());
        const play = () => (spin.play(), counterSpin.play());
        orbit.addEventListener("pointerenter", pause);
        orbit.addEventListener("pointerleave", play);
        orbit.addEventListener("focusin", pause);
        orbit.addEventListener("focusout", play);

        gsap.from(".quorum-head > *", {
          y: 40,
          autoAlpha: 0,
          stagger: 0.1,
          duration: 1,
          ease: EASE,
          scrollTrigger: { trigger: ".quorum-head", start: "top 80%" },
        });
        gsap.from(".orbit-wrap", {
          scale: 0.7,
          rotation: -40,
          autoAlpha: 0,
          duration: 1.6,
          ease: EASE,
          scrollTrigger: { trigger: ".orbit-wrap", start: "top 80%" },
        });

        return () => {
          orbit.removeEventListener("pointerenter", pause);
          orbit.removeEventListener("pointerleave", play);
          orbit.removeEventListener("focusin", pause);
          orbit.removeEventListener("focusout", play);
        };
      });
    },
    { scope: root },
  );

  // El monto de la bóveda cuenta hacia arriba/abajo en vez de saltar
  useEffect(() => {
    const el = amountEl.current;
    if (!el) return;
    if (reduced()) {
      el.textContent = money(shown);
      counter.current.v = shown;
      return;
    }
    const tween = gsap.to(counter.current, {
      v: shown,
      duration: 0.9,
      ease: "power3.out",
      onUpdate: () => (el.textContent = money(Math.round(counter.current.v))),
    });
    return () => {
      tween.kill();
    };
  }, [shown]);

  /** Una moneda vuela desde la cara de la persona hasta la bóveda. */
  function flyCoin(id: string) {
    if (reduced() || !wrap.current || !vault.current) return;
    const face = wrap.current.querySelector<HTMLElement>(`[data-face="${id}"]`);
    if (!face) return;
    const w = wrap.current.getBoundingClientRect();
    const f = face.getBoundingClientRect();
    const v = vault.current.getBoundingClientRect();
    const coin = document.createElement("span");
    coin.textContent = "$";
    coin.setAttribute("aria-hidden", "true");
    coin.className =
      "pointer-events-none absolute z-30 grid size-8 place-items-center rounded-full bg-hold font-mono text-sm font-bold text-ink shadow-lg";
    wrap.current.appendChild(coin);
    gsap.set(coin, {
      left: f.left - w.left + f.width / 2 - 16,
      top: f.top - w.top + f.height / 2 - 16,
    });
    gsap
      .timeline({ onComplete: () => coin.remove() })
      .from(coin, { scale: 0, duration: 0.2, ease: "back.out(3)" })
      .to(coin, {
        x: v.left - w.left + v.width / 2 - 16 - (f.left - w.left + f.width / 2 - 16),
        y: v.top - w.top + v.height / 2 - 16 - (f.top - w.top + f.height / 2 - 16),
        scale: 0.5,
        duration: 0.8,
        ease: "power3.in",
      })
      .to(coin, { autoAlpha: 0, duration: 0.15 }, "-=0.1");
    gsap.fromTo(
      vault.current,
      { scale: 1 },
      {
        scale: 1.04,
        duration: 0.18,
        yoyo: true,
        repeat: 1,
        delay: 0.85,
        ease: "power2.out",
      },
    );
  }

  // Sello "Paid in full" / "Nobody charged": GSAP maneja su rotación (no usar `rotate` de CSS aquí)
  function stampIn() {
    const el = root.current?.querySelector(".stamp");
    if (!el || reduced()) return;
    gsap.fromTo(
      el,
      { scale: 2.2, rotation: -24, autoAlpha: 0 },
      {
        scale: 1,
        rotation: -8,
        autoAlpha: 1,
        duration: 0.5,
        ease: "back.out(2.5)",
      },
    );
  }
  function celebrate() {
    stampIn();
    const chip = root.current?.querySelector(".host-chip");
    if (!chip || reduced()) return;
    gsap.fromTo(chip, { y: 16, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6, delay: 0.5, ease: EASE });
  }
  // Al reiniciar, quitar los estilos en línea que dejó GSAP (si no, el sello seguiría visible)
  function clearFx() {
    root.current?.querySelectorAll(".stamp, .host-chip").forEach((el) => gsap.set(el, { clearProps: "all" }));
  }

  function toggle(id: string) {
    if (phase !== "collecting") return;
    const p = PEOPLE.find((x) => x.id === id)!;
    const on = authorized.includes(id);
    const next = on ? authorized.filter((x) => x !== id) : [...authorized, id];
    setAuthorized(next);
    if (lucky) {
      push(p.name, on ? "OPTED_OUT" : "IN", on ? "no longer in the game" : "agrees to play", on ? "void" : "hold");
    } else if (on) {
      push(p.name, "HOLD_VOIDED", `${money(shareOf(id))} released`, "void");
    } else {
      push(p.name, "AUTHORIZED", `${money(shareOf(id))} hold placed`, "hold");
      requestAnimationFrame(() => flyCoin(id));
    }
    if (next.length === total && lucky) {
      setTimeout(startDraw, 1100);
    } else if (next.length === total) {
      setTimeout(() => {
        setPhase("captured");
        showRing();
        push("Quorum", "CAPTURED", `${money(TOTAL)} · 5/5 at once`, "ok");
        requestAnimationFrame(celebrate);
      }, 1100);
    }
  }

  /** El ganador se decide ya, con aleatoriedad real; la animación solo lo dramatiza. */
  /** En móvil el anillo queda debajo de la lista: al cerrar el quórum lo traemos a la vista. */
  function showRing() {
    if (window.innerWidth < 1024)
      wrap.current?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "center" });
  }

  function startDraw() {
    showRing();
    const buf = new Uint32Array(2);
    crypto.getRandomValues(buf);
    const w = buf[0] % total;
    const seed = buf[1].toString(16).padStart(8, "0");
    setWinner(w);
    setPhase("drawing");
    push("Quorum", "UNANIMOUS", `${total}/${total} agreed to play`, "ok");
    const proof = async () => {
      try {
        const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${seed}:${w}`));
        const hex = Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
        push("Quorum", "DRAW", `proof sha256:${hex.slice(0, 10)}…`, "hold");
      } catch {
        push("Quorum", "DRAW", `seed ${seed}`, "hold");
      }
    };
    void proof();
  }
  function drawDone() {
    setPhase("drawn");
    push(PEOPLE[winner].name, "RESULT", `pays ${money(TOTAL)} · others free`, "ok");
  }

  function pickMode(m: Mode) {
    if (m === mode) return;
    setMode(m);
    reset();
  }

  function expire() {
    setPhase("expired");
    push(
      "Quorum",
      "DEADLINE_PASSED",
      lucky ? "nobody drawn · nobody charged" : `${done} holds voided · nobody charged`,
      "void",
    );
    requestAnimationFrame(stampIn);
  }

  function reset() {
    setAuthorized([]);
    setPhase("collecting");
    setLog([]);
    clearFx();
  }

  const status =
    phase === "drawn"
      ? `${PEOPLE[winner].name} drew the short straw and pays ${money(TOTAL)}.`
      : phase === "drawing"
        ? "Drawing a card…"
        : phase === "captured"
          ? `Quorum reached. ${money(TOTAL)} captured from ${total} people.`
          : phase === "expired"
            ? `Deadline passed. ${done} holds released. Nobody was charged.`
            : lucky
              ? `${done} of ${total} agreed to play.`
              : `${done} of ${total} authorized. ${money(0)} charged so far.`;

  const ringColor = (on: boolean) =>
    phase === "captured" ? GREEN : phase === "expired" ? "rgba(251,249,239,.12)" : on ? HOLD : "rgba(251,249,239,.14)";

  return (
    <section
      ref={root}
      id="quorum"
      aria-labelledby="quorum-title"
      className="grain relative overflow-hidden bg-ink py-28 text-paper sm:py-40"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="quorum-head max-w-4xl">
          <p className="mb-8 font-mono text-xs uppercase tracking-[0.18em] text-paper/60 sm:text-[13px]">
            (05) — The guarantee · try it
          </p>
          <h2 id="quorum-title" className="display text-[clamp(2.6rem,6.5vw,6.5rem)] uppercase">
            No one is charged until the <span style={{ color: HOLD }}>ring closes.</span>
          </h2>
        </div>

        <div className="mt-10 grid items-center gap-12 lg:mt-20 lg:gap-14 lg:grid-cols-[1.1fr_1fr]">
          {/* ── Anillo + bóveda ── */}
          <div className="relative mx-auto w-full max-w-[min(100%,32rem)] max-lg:order-2">
            <div ref={wrap} className="orbit-wrap relative aspect-square w-full">
              <div className={`orbit absolute inset-0 transition-opacity duration-500 ${drawPhase ? "opacity-0" : ""}`}>
                <svg
                  viewBox={`0 0 ${SIZE} ${SIZE}`}
                  className="absolute inset-0 size-full"
                  role="img"
                  aria-label={status}
                >
                  <g transform={`rotate(-90 ${C} ${C})`}>
                    {PEOPLE.map((p, i) => (
                      <circle
                        key={p.id}
                        cx={C}
                        cy={C}
                        r={R}
                        fill="none"
                        stroke={ringColor(authorized.includes(p.id))}
                        strokeWidth={STROKE}
                        strokeLinecap="round"
                        strokeDasharray={`${SEG - GAP - STROKE} ${CIRC}`}
                        strokeDashoffset={-(i * SEG + GAP / 2 + STROKE / 2)}
                        style={{ transition: "stroke .5s ease" }}
                      />
                    ))}
                  </g>
                </svg>

                {PEOPLE.map((p, i) => {
                  const on = authorized.includes(p.id);
                  const a = angleOf(i);
                  return (
                    <div
                      key={p.id}
                      className="absolute -translate-x-1/2 -translate-y-1/2"
                      style={{
                        left: `${50 + (R / SIZE) * 100 * Math.cos(a)}%`,
                        top: `${50 + (R / SIZE) * 100 * Math.sin(a)}%`,
                      }}
                    >
                      <div className="orbit-face">
                        <button
                          type="button"
                          data-face={p.id}
                          translate="no"
                          onClick={() => toggle(p.id)}
                          disabled={phase !== "collecting"}
                          aria-pressed={on}
                          aria-label={`${on ? "Cancel" : "Authorize"} ${p.name}'s ${money(shareOf(p.id))}`}
                          className="group relative grid size-14 place-items-center rounded-full font-mono text-lg font-semibold text-white shadow-lg ring-4 ring-ink transition-[filter] hover:brightness-110 disabled:cursor-default sm:size-16"
                          style={{
                            background: p.hue,
                            filter: on || phase === "captured" ? "none" : "grayscale(.85) opacity(.55)",
                          }}
                        >
                          {p.name[0]}
                          <span
                            className={`absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full bg-ink transition-transform duration-300 ${on ? "scale-100" : "scale-0"}`}
                          >
                            <Check
                              aria-hidden
                              className="size-4"
                              strokeWidth={3}
                              style={{
                                color: phase === "captured" ? GREEN : HOLD,
                              }}
                            />
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bóveda: se llena con el dinero retenido */}
              <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
                <div
                  ref={vault}
                  className="relative grid aspect-square w-[56%] place-items-center overflow-hidden rounded-full border border-paper/20 bg-paper/[0.04] text-center"
                >
                  <div
                    className="absolute inset-x-0 bottom-0 transition-[height,background-color] duration-[900ms] ease-[cubic-bezier(.16,1,.3,1)]"
                    style={{
                      height: `${phase === "captured" ? 100 : fill}%`,
                      backgroundColor: phase === "captured" ? "rgba(62,207,142,.42)" : "rgba(255,199,101,.34)",
                    }}
                  >
                    <span className="absolute inset-x-0 top-0 h-px bg-white/40" />
                  </div>
                  <div className="relative px-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper/70">
                      {phase === "captured"
                        ? "Captured"
                        : phase === "expired"
                          ? "Released"
                          : lucky
                            ? "The bill"
                            : "On hold"}
                    </p>
                    <p ref={amountEl} className="num display mt-1 text-[clamp(1.9rem,5.2vw,3rem)] leading-none">
                      {money(0)}
                    </p>
                    <p className="mt-2 font-mono text-[11px] text-paper/70">
                      {phase === "collecting" && (
                        <>
                          {done}/{total} {lucky ? "in" : ""} · closes in <Countdown running />
                        </>
                      )}
                      {phase === "drawing" && "drawing…"}
                      {phase === "drawn" && "one pays, four are free"}
                      {phase === "captured" && "5/5 · charged at once"}
                      {phase === "expired" && "nobody was charged"}
                    </p>
                  </div>
                </div>
              </div>

              {drawPhase && (
                <LuckyDraw key={winner} winner={winner} total={TOTAL} instant={reduced()} onDone={drawDone} />
              )}

              <div aria-hidden className="pointer-events-none absolute inset-x-0 top-[24%] z-20 flex justify-center">
                <div
                  className={`stamp rounded-md border-[3px] bg-ink/70 px-3 py-1 font-mono text-sm font-semibold uppercase tracking-widest backdrop-blur ${
                    phase === "collecting" || drawPhase ? "invisible" : "visible"
                  }`}
                  style={{
                    color: phase === "expired" ? "#ff7b73" : GREEN,
                    borderColor: phase === "expired" ? "#ff7b73" : GREEN,
                  }}
                >
                  {phase === "expired" ? "Nobody charged" : "Paid in full"}
                </div>
              </div>
            </div>

            {/* Quién recibe el dinero, solo al cerrar */}
            <p
              className={`host-chip mx-auto mt-6 flex w-fit items-center gap-2 rounded-full border border-paper/20 bg-paper/10 px-4 py-2 font-mono text-xs ${phase === "captured" ? "" : "invisible"}`}
            >
              <span aria-hidden>→</span> Lucía (host) receives{" "}
              <strong className="num text-[#3ecf8e]">{money(TOTAL)}</strong>
            </p>
          </div>

          {/* ── Panel ── */}
          <div className="max-lg:order-1">
            <div
              role="group"
              aria-label="Mode"
              className="mb-5 inline-flex rounded-full border border-paper/20 p-1 font-mono text-xs"
            >
              {(["fair", "lucky"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => pickMode(m)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 transition-colors ${mode === m ? "bg-paper text-ink" : "text-paper/70 hover:text-paper"}`}
                >
                  {m === "lucky" && <Dices aria-hidden className="size-3.5" />}
                  {m === "fair" ? "Split fair" : "Feeling lucky"}
                </button>
              ))}
            </div>
            <p className="max-w-md text-lg leading-relaxed text-paper/80">
              {lucky ? (
                <>
                  Everyone has to <strong className="font-semibold text-paper">agree to play</strong>. Once the ring
                  closes, the cards are drawn: one person pays the whole bill, the other four walk away free. Fair odds,
                  logged with a verifiable proof.
                </>
              ) : (
                <>
                  Each person <strong className="font-semibold text-paper">authorizes</strong> their share with PayPal.
                  That’s a hold, not a charge. When the last one says yes, Quorum captures everything at once. If the
                  deadline passes first, every hold is released.
                </>
              )}
            </p>

            <Note className="ml-auto mt-2 hidden w-fit text-hold lg:flex" rotate={-3}>
              {lucky ? "everyone must say yes" : "a hold, not a charge"}
            </Note>

            <ul className="mt-2 divide-y divide-paper/15 border-y border-paper/15">
              {PEOPLE.map((p) => {
                const on = authorized.includes(p.id);
                const idx = PEOPLE.indexOf(p);
                const state =
                  phase === "drawn"
                    ? idx === winner
                      ? "Pays it"
                      : "Free"
                    : phase === "drawing"
                      ? "Drawing"
                      : phase === "captured"
                        ? "Paid"
                        : phase === "expired"
                          ? on
                            ? "Released"
                            : "Ghosted"
                          : on
                            ? lucky
                              ? "In"
                              : "On hold"
                            : "Waiting";
                const chip =
                  state === "Paid" || state === "Free"
                    ? "bg-[#3ecf8e]/20 text-[#3ecf8e]"
                    : state === "Pays it"
                      ? "bg-hold text-ink"
                      : state === "On hold" || state === "In"
                        ? "bg-hold/25 text-hold"
                        : state === "Ghosted"
                          ? "bg-danger/20 text-[#ff8a83]"
                          : "bg-paper/10 text-paper/65";
                return (
                  <li key={p.id} className="flex items-center gap-3 py-3">
                    <span
                      aria-hidden
                      translate="no"
                      className="grid size-8 place-items-center rounded-full font-mono text-sm font-semibold text-white"
                      style={{ background: p.hue }}
                    >
                      {p.name[0]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span translate="no">{p.name}</span>{" "}
                      <span className="text-sm text-paper/60">
                        · {p.from} {p.flag}
                      </span>
                    </span>
                    <span className="text-right font-mono leading-tight">
                      <span className="num block text-sm">
                        {phase === "drawn" ? money(idx === winner ? TOTAL : 0) : lucky ? "—" : money(shareOf(p.id))}
                      </span>
                      <span className="num block text-[11px] text-paper/55">
                        {lucky || phase === "drawn" ? "" : localLabel(p.id)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => toggle(p.id)}
                      disabled={phase !== "collecting"}
                      aria-pressed={on}
                      aria-label={`${on ? "Cancel" : lucky ? "Agree for" : "Authorize"} ${p.name}`}
                      className={`w-24 rounded-full px-3 py-1 text-center font-mono text-xs transition-colors enabled:hover:ring-1 enabled:hover:ring-paper/40 ${chip}`}
                    >
                      {state}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 font-mono text-[11px] text-paper/50">
              {lucky
                ? "The loser then authorizes the full amount with PayPal (24h) · 1 in 5 odds each"
                : "Charged in USD · shown in each person’s currency (illustrative rates)"}
            </p>

            {/* Registro en vivo: el mismo libro mayor de la sección siguiente */}
            <ul aria-label="Live events" className="mt-5 min-h-[7.25rem] space-y-1.5 font-mono text-[12px]">
              {log.map((l) => (
                <li key={l.id} className="toast-in flex items-center gap-2 rounded-md bg-paper/[0.06] px-3 py-1.5">
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{
                      background: l.tone === "ok" ? GREEN : l.tone === "hold" ? HOLD : "#ff8a83",
                    }}
                  />
                  <span translate="no" className="w-14 shrink-0 text-paper/60">
                    {l.who}
                  </span>
                  <span
                    style={{
                      color: l.tone === "ok" ? GREEN : l.tone === "hold" ? HOLD : "#ff8a83",
                    }}
                  >
                    {l.event}
                  </span>
                  <span className="truncate text-paper/65">{l.detail}</span>
                </li>
              ))}
            </ul>

            <p role="status" aria-live="polite" className="sr-only">
              {status}
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              {phase === "drawing" ? null : phase === "collecting" ? (
                <button
                  type="button"
                  onClick={expire}
                  className="inline-flex items-center gap-2 rounded-full border border-paper/25 px-5 py-3 text-sm transition-colors hover:border-paper"
                >
                  <Clock aria-hidden className="size-4" /> Let the deadline pass
                </button>
              ) : (
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-2 rounded-full bg-paper px-5 py-3 text-sm text-ink transition-colors hover:bg-hold"
                >
                  <RotateCcw aria-hidden className="size-4" /> Try again
                </button>
              )}
              <span className="inline-flex items-center gap-2 px-1 py-3 text-sm text-paper/60">
                <ShieldCheck aria-hidden className="size-4" /> Powered by PayPal authorize &amp; capture
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
