"use client";

import { Check } from "lucide-react";
import { useEffect, useRef } from "react";
import { PEOPLE, money } from "./demo-bill";
import { gsap, useGSAP } from "./gsap";

/** Radio de las cartas como fracción del ancho (el mismo que el del anillo de quórum). */
const RADIUS = 150 / 360;

function Card({ i, winner, total }: { i: number; winner: number; total: number }) {
  const p = PEOPLE[i];
  const wins = i === winner;
  return (
    <div className="lk-card absolute left-1/2 top-1/2 -ml-[8.5%] -mt-[11.9%] aspect-[5/7] w-[17%] [perspective:900px]">
      <div className="lk-flip relative size-full [transform-style:preserve-3d]">
        {/* Dorso */}
        <div
          aria-hidden
          className="absolute inset-0 grid place-items-center rounded-lg border border-hold/60 bg-[#2a2522] shadow-xl [backface-visibility:hidden]"
        >
          <span className="absolute inset-[5px] rounded-md border border-hold/35 bg-[repeating-linear-gradient(45deg,rgba(255,199,101,.16)_0_5px,transparent_5px_10px)]" />
          <span className="display relative grid size-[46%] place-items-center rounded-full bg-ink text-[clamp(.9rem,3vw,1.5rem)] text-hold">
            Q
          </span>
        </div>
        {/* Frente */}
        <div
          translate="no"
          className="absolute inset-0 flex flex-col items-center justify-between rounded-lg bg-paper p-[7%] text-ink shadow-xl [backface-visibility:hidden] [transform:rotateY(180deg)]"
          style={
            wins
              ? {
                  boxShadow: "0 0 0 3px #ffc765, 0 0 40px 6px rgba(255,199,101,.55)",
                }
              : undefined
          }
        >
          <span className="self-start font-mono text-[clamp(.4rem,1.1vw,.62rem)] font-semibold">{p.name[0]}</span>
          <span
            className="grid aspect-square w-[52%] place-items-center rounded-full font-mono text-[clamp(.7rem,2.2vw,1.2rem)] font-semibold text-white"
            style={{ background: p.hue }}
          >
            {p.name[0]}
          </span>
          <span className="text-[clamp(.45rem,1.4vw,.78rem)] font-semibold leading-none">{p.name}</span>
          {wins ? (
            <span className="w-full rounded-sm bg-hold py-[3px] text-center font-mono text-[clamp(.3rem,.95vw,.52rem)] font-bold uppercase leading-tight tracking-wider">
              pays it all
              <br />
              {money(total)}
            </span>
          ) : (
            <span className="flex w-full items-center justify-center gap-0.5 rounded-sm bg-ok-soft py-[3px] font-mono text-[clamp(.3rem,.95vw,.52rem)] font-bold uppercase tracking-wider text-ok">
              <Check aria-hidden className="size-[1.2em]" strokeWidth={4} /> safe
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * El sorteo: las cartas se barajan, se abren en círculo, giran y se van descartando (cada una se voltea
 * un instante: "Sam is safe"). La última se centra, se agranda y se voltea: esa persona paga todo.
 * El ganador ya viene decidido por el padre (aleatoriedad real + registro); esto solo lo dramatiza.
 */
export function LuckyDraw({
  winner,
  total,
  instant,
  onDone,
}: {
  winner: number;
  total: number;
  instant: boolean;
  onDone: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const cb = useRef(onDone);
  useEffect(() => {
    cb.current = onDone;
  });

  // Movimiento reducido: resultado directo, sin animación
  useEffect(() => {
    if (instant) cb.current();
  }, [instant]);

  useGSAP(
    () => {
      if (instant) return;
      const el = root.current!;
      const w = el.getBoundingClientRect().width;
      const r = w * RADIUS;
      const cards = gsap.utils.toArray<HTMLElement>(".lk-card", el);
      const flips = gsap.utils.toArray<HTMLElement>(".lk-flip", el);
      const n = cards.length;
      const base = (i: number) => ((i + 0.5) / n) * Math.PI * 2 - Math.PI / 2;
      const deg = (a: number) => (a * 180) / Math.PI + 90;
      const st = { theta: 0 };
      const place = () =>
        cards.forEach((c, i) => {
          const a = base(i) + st.theta;
          gsap.set(c, {
            x: r * Math.cos(a),
            y: r * Math.sin(a),
            rotation: deg(a),
          });
        });

      gsap.set(cards, {
        x: 0,
        y: 0,
        scale: 0.9,
        autoAlpha: 0,
        rotation: () => gsap.utils.random(-6, 6),
      });

      const order = gsap.utils.shuffle(cards.map((_, i) => i).filter((i) => i !== winner));
      const tl = gsap.timeline({ onComplete: () => cb.current() });

      tl.to(cards, { autoAlpha: 1, scale: 1, stagger: 0.05, duration: 0.4 })
        // Se barajan
        .to(cards, {
          x: (i) => (i % 2 ? 1 : -1) * w * 0.12,
          duration: 0.28,
          ease: "power2.inOut",
          stagger: 0.02,
        })
        .to(cards, { x: 0, duration: 0.28, ease: "power2.inOut" })
        .to(cards, {
          x: (i) => (i % 2 ? -1 : 1) * w * 0.1,
          duration: 0.24,
          ease: "power2.inOut",
        })
        .to(cards, { x: 0, duration: 0.24, ease: "power2.inOut" })
        // Se abren en círculo
        .to(cards, {
          x: (i) => r * Math.cos(base(i)),
          y: (i) => r * Math.sin(base(i)),
          rotation: (i) => deg(base(i)),
          duration: 0.9,
          ease: "power3.out",
          stagger: 0.05,
        })
        // Giran (tres vueltas, frenando al final)
        .to(st, {
          theta: Math.PI * 6,
          duration: 3.2,
          ease: "power3.inOut",
          onUpdate: place,
        })
        .to(cards, { rotation: 0, duration: 0.4, ease: "power2.out" });

      // Se descartan las que están a salvo, una por una
      order.forEach((i) => {
        tl.to(flips[i], { rotationY: 180, duration: 0.5, ease: "power2.inOut" }, ">+0.18").to(
          cards[i],
          {
            y: "-=36",
            scale: 0.7,
            autoAlpha: 0,
            duration: 0.45,
            ease: "power2.in",
          },
          ">+0.5",
        );
      });

      // La última: al centro, grande, y se voltea
      tl.to(cards[winner], { x: 0, y: 0, scale: 2.05, duration: 0.85, ease: "power3.inOut" }, ">+0.2")
        .to(flips[winner], { rotationY: 180, duration: 0.8, ease: "back.out(1.5)" }, ">-0.25")
        .to({}, { duration: 0.5 });
    },
    { scope: root, dependencies: [winner, instant] },
  );

  if (instant) {
    return (
      <div ref={root} className="pointer-events-none absolute inset-0 z-30" aria-hidden>
        <div style={{ transform: "scale(2.05)" }} className="absolute inset-0">
          <div className="absolute inset-0 [&_.lk-flip]:[transform:rotateY(180deg)]">
            <Card i={winner} winner={winner} total={total} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={root} className="pointer-events-none absolute inset-0 z-30" aria-hidden>
      {PEOPLE.map((p, i) => (
        <Card key={p.id} i={i} winner={winner} total={total} />
      ))}
    </div>
  );
}
