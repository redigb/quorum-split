"use client";

import { Camera, Mic } from "lucide-react";
import { useRef } from "react";
import { SceneSend, SceneSnap, SceneSplit } from "./HowScenes";
import { EASE, MOTION_OK, gsap, useGSAP } from "./gsap";
import { Note } from "./Note";

const STEPS = [
  {
    n: "01",
    title: "Snap it",
    body: "Take a photo of the receipt, or just say what everyone had. AI reads every line, and we check the sum against the printed total — to the cent — before anything moves.",
    note: "no typing. the AI reads it.",
    // Tarjeta violeta
    card: "bg-accent text-paper",
    sub: "text-paper/80",
    noteColor: "text-hold",
    Scene: SceneSnap,
  },
  {
    n: "02",
    title: "Split it fair",
    body: "Tap who had what. A shared bottle? Split three ways. Tax and tip follow what each person actually ordered. The math is a deterministic engine, never a guess.",
    note: "tax & tip follow your plate",
    // Tarjeta ámbar
    card: "bg-hold text-ink",
    sub: "text-ink/75",
    noteColor: "text-accent",
    Scene: SceneSplit,
  },
  {
    n: "03",
    title: "Send the room",
    body: "Everyone gets a link with their exact amount. No app, no sign-up. They authorize with PayPal and the room fills up in real time.",
    note: "no app. no sign-up.",
    // Tarjeta verde
    card: "bg-ok text-white",
    sub: "text-white/85",
    noteColor: "text-hold",
    Scene: SceneSend,
  },
];

const TOP_REM = 5.5; // debajo de la barra de navegación
const STEP_PX = 18; // cuánto asoma cada tarjeta anterior al apilarse

export function HowItWorks() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(MOTION_OK, () => {
        gsap.from(".how-head > *", {
          y: 40,
          autoAlpha: 0,
          stagger: 0.1,
          duration: 1,
          ease: EASE,
          scrollTrigger: { trigger: ".how-head", start: "top 80%" },
        });
      });

      // Al apilarse: la tarjeta anterior se achica y se oscurece cuando la siguiente sube sobre ella (solo desktop)
      mm.add(`${MOTION_OK} and (min-width: 768px)`, () => {
        const cards = gsap.utils.toArray<HTMLElement>(".how-card");
        cards.forEach((card, i) => {
          const next = cards[i + 1];
          if (!next) return;
          gsap.to(card, {
            scale: 0.93 - i * 0.01,
            filter: "brightness(0.8)",
            ease: "none",
            scrollTrigger: {
              trigger: next.parentElement,
              start: "top 85%",
              end: "top 25%",
              scrub: true,
            },
          });
        });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="how" aria-labelledby="how-title" className="grain relative bg-paper pb-28 pt-28 sm:pt-40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="how-head max-w-4xl">
          <p className="mb-8 font-mono text-xs uppercase tracking-[0.18em] text-muted sm:text-[13px]">
            (03) — How it works
          </p>
          <h2 id="how-title" className="display text-[clamp(2.6rem,6.5vw,6.5rem)] uppercase">
            Split it. <span className="text-accent">Settle it.</span>
          </h2>
          <p className="mt-6 flex items-center gap-2 text-lg text-muted">
            <Camera aria-hidden className="size-5" /> photo, or <Mic aria-hidden className="size-5" /> voice — your
            call.
          </p>
        </div>

        <ol className="mt-14 md:mt-20">
          {STEPS.map((s, i) => {
            const Scene = s.Scene;
            return (
              <li
                key={s.n}
                className="how-item mb-6 md:sticky md:mb-[16vh] md:last:mb-0"
                style={{ top: `calc(${TOP_REM}rem + ${i * STEP_PX}px)` }}
              >
                <article
                  className={`how-card origin-top overflow-hidden rounded-[1.75rem] p-5 shadow-[0_30px_60px_-30px_#17141270] sm:p-8 md:h-[min(74svh,38rem)] ${s.card}`}
                >
                  <div className="grid h-full gap-6 md:grid-cols-[0.85fr_1.15fr] md:gap-10">
                    <div className="flex flex-col">
                      <p className="display text-[clamp(4.5rem,11vw,9rem)] leading-[0.8] opacity-95" aria-hidden>
                        {s.n}
                      </p>
                      <h3 className="display mt-4 text-4xl uppercase sm:text-5xl">{s.title}</h3>
                      <p className={`mt-4 max-w-md text-base leading-relaxed sm:text-lg ${s.sub}`}>{s.body}</p>
                      <Note className={`mt-auto hidden pt-6 md:flex ${s.noteColor}`} rotate={-3}>
                        {s.note}
                      </Note>
                    </div>
                    <div className="min-h-0">
                      <Scene />
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
