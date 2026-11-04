"use client";

import { ArrowRight } from "lucide-react";
import { useRef } from "react";
import { EASE, MOTION_OK, gsap, useGSAP } from "./gsap";
import { PHOTOS, type Photo } from "./photos";
import { Shot } from "./Shot";

interface Case {
  photo: Photo;
  tag: string;
  title: string;
  meta: string;
  total: string;
  people: number;
  time: string;
}

const CASES: Case[] = [
  {
    photo: PHOTOS.candlelit,
    tag: "Dinner",
    title: "Last night in Lisbon",
    meta: "PT · 5 friends · 4 countries",
    total: "$228.18",
    people: 5,
    time: "settled in 7 min",
  },
  {
    photo: PHOTOS.nightMarket,
    tag: "Street food",
    title: "Night market crawl",
    meta: "TW · 6 friends · 11 stalls",
    total: "$94.40",
    people: 6,
    time: "settled in 4 min",
  },
  {
    photo: PHOTOS.rooftop,
    tag: "Birthday",
    title: "Rooftop for Diego’s 30th",
    meta: "MX · 9 friends · 3 currencies",
    total: "$612.75",
    people: 9,
    time: "settled in 12 min",
  },
  {
    photo: PHOTOS.sunset,
    tag: "Trip",
    title: "Road trip, shared everything",
    meta: "US → CA · 4 friends · 5 days",
    total: "$1,284.50",
    people: 4,
    time: "settled in 9 min",
  },
  {
    photo: PHOTOS.champagne,
    tag: "Celebration",
    title: "The engagement toast",
    meta: "ES · 12 guests · 1 bottle too many",
    total: "$846.00",
    people: 12,
    time: "settled in 15 min",
  },
];

export function UseCases() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      // Desktop: la fila de tarjetas se desplaza en horizontal mientras la sección queda fija
      mm.add(`${MOTION_OK} and (min-width: 768px)`, () => {
        const track = root.current!.querySelector<HTMLElement>(".cases-track")!;
        const distance = () => track.scrollWidth - window.innerWidth;

        const tween = gsap.to(track, {
          x: () => -distance(),
          ease: "none",
          scrollTrigger: {
            trigger: ".cases-pin",
            start: "top top",
            end: () => `+=${distance()}`,
            scrub: 0.8,
            pin: true,
            invalidateOnRefresh: true,
          },
        });

        // Dentro del desplazamiento horizontal: cada foto se revela y hace parallax
        gsap.utils.toArray<HTMLElement>(".case-card").forEach((card) => {
          const st = { trigger: card, containerAnimation: tween, start: "left 95%", end: "right 5%", scrub: true };
          gsap.fromTo(
            card.querySelector(".shot-inner"),
            { xPercent: -8, scale: 1.15 },
            { xPercent: 8, scale: 1.15, ease: "none", scrollTrigger: st },
          );
          gsap.from(card.querySelector(".shot"), {
            clipPath: "inset(12% 12% 12% 12% round 24px)",
            ease: "none",
            scrollTrigger: {
              trigger: card,
              containerAnimation: tween,
              start: "left 100%",
              end: "left 55%",
              scrub: true,
            },
          });
        });

        gsap.to(".cases-progress", {
          scaleX: 1,
          ease: "none",
          scrollTrigger: { trigger: ".cases-pin", start: "top top", end: () => `+=${distance()}`, scrub: true },
        });
      });

      // Móvil: carrusel nativo; solo una entrada suave
      mm.add(`${MOTION_OK} and (max-width: 767px)`, () => {
        gsap.from(".case-card", {
          autoAlpha: 0,
          x: 60,
          stagger: 0.1,
          duration: 1,
          ease: EASE,
          scrollTrigger: { trigger: ".cases-track", start: "top 85%" },
        });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="cases" aria-labelledby="cases-title" className="relative bg-paper-2">
      <div className="cases-pin flex min-h-svh flex-col justify-center overflow-hidden py-24 md:py-0">
        <div className="mx-auto mb-10 flex w-full max-w-7xl items-end justify-between gap-6 px-4 sm:px-6 md:mb-8">
          <div>
            <p className="mb-6 font-mono text-xs uppercase tracking-[0.18em] text-muted sm:text-[13px]">
              (04) — Built for groups that move
            </p>
            <h2 id="cases-title" className="display text-[clamp(2.6rem,6.5vw,6.5rem)] uppercase">
              One link. <span className="text-accent">Any table.</span>
            </h2>
          </div>
          <p className="hidden items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted md:flex">
            Scroll <ArrowRight aria-hidden className="size-4" />
          </p>
        </div>

        <ul
          className="cases-track flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:px-6 md:snap-none md:gap-6 md:overflow-visible md:pl-[max(1.5rem,calc((100vw-80rem)/2+1.5rem))] md:pr-[10vw]"
          aria-label="Example groups"
        >
          {CASES.map((c) => (
            <li
              key={c.title}
              className="case-card group w-[82vw] shrink-0 snap-center sm:w-[60vw] md:w-[min(38vw,44svh)] lg:w-[min(32vw,44svh)]"
            >
              <article>
                <div className="relative">
                  <Shot
                    photo={c.photo}
                    sizes="(max-width: 768px) 82vw, 34vw"
                    className="aspect-[4/5] rounded-[1.25rem]"
                  />
                  <span className="absolute left-3 top-3 rounded-full bg-paper/90 px-3 py-1 font-mono text-[11px] uppercase tracking-wider backdrop-blur">
                    {c.tag}
                  </span>
                  {/* Mini sala: el resultado */}
                  <div
                    translate="no"
                    className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-3 rounded-card bg-ink/85 px-4 py-3 text-paper backdrop-blur-md transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)] group-hover:-translate-y-1"
                  >
                    <div>
                      <p className="num font-mono text-lg font-semibold">{c.total}</p>
                      <p className="font-mono text-[11px] uppercase tracking-wider text-paper/60">
                        {c.people}/{c.people} confirmed
                      </p>
                    </div>
                    <span className="rounded-full bg-ok px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-white">
                      {c.time}
                    </span>
                  </div>
                </div>
                <h3 className="display mt-5 text-3xl uppercase sm:text-4xl">{c.title}</h3>
                <p className="mt-2 font-mono text-xs uppercase tracking-wider text-muted">{c.meta}</p>
              </article>
            </li>
          ))}
        </ul>

        <div className="mx-auto mt-8 hidden h-px w-full max-w-7xl bg-line md:block" aria-hidden>
          <div className="cases-progress h-full origin-left bg-ink" style={{ transform: "scaleX(0)" }} />
        </div>
      </div>
    </section>
  );
}
