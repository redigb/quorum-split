"use client";

import { useRef } from "react";
import { MOTION_OK, gsap, useGSAP } from "./gsap";
import { PHOTOS } from "./photos";
import { Shot } from "./Shot";

// 3×3: la del centro es la que arranca a pantalla completa.
const GRID = [
  { photo: PHOTOS.nightMarket, place: "Taipei" },
  { photo: PHOTOS.toastRed, place: "Madrid" },
  { photo: PHOTOS.skewers, place: "Beijing" },
  { photo: PHOTOS.charcuterie, place: "Austin" },
  { photo: PHOTOS.candlelit, place: "Lisbon" },
  { photo: PHOTOS.pizzaParty, place: "Lima" },
  { photo: PHOTOS.champagne, place: "Toronto" },
  { photo: PHOTOS.longTable, place: "CDMX" },
  { photo: PHOTOS.bar, place: "Osaka" },
];

export function ZoomGallery() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const center = root.current!.querySelector<HTMLElement>(".zoom-tile.is-center")!;
        // Escala necesaria para que la foto central cubra todo el viewport (depende del tamaño de pantalla)
        const cover = () => {
          const { offsetWidth: w, offsetHeight: h } = center;
          return Math.max(window.innerWidth / w, window.innerHeight / h) * 1.03;
        };

        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: "+=180%",
            scrub: 0.8,
            pin: ".zoom-stage",
            invalidateOnRefresh: true,
          },
        });
        // Arranca con la foto central llenando la pantalla y se aleja hasta ver toda la grilla
        tl.fromTo(".zoom-grid", { scale: cover }, { scale: 1, duration: 1 }, 0)
          .fromTo(".zoom-tile:not(.is-center)", { autoAlpha: 0.25 }, { autoAlpha: 1, duration: 0.6 }, 0.25)
          .to(".zoom-intro", { autoAlpha: 0, yPercent: -30, duration: 0.3 }, 0.05)
          .from(".zoom-label", { autoAlpha: 0, y: 12, stagger: 0.03, duration: 0.2 }, 0.75)
          .from(".zoom-outro", { autoAlpha: 0, y: 30, duration: 0.25 }, 0.8);
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} aria-label="Tables around the world" className="relative bg-ink">
      <div className="zoom-stage relative flex h-svh items-center justify-center overflow-hidden">
        <div className="zoom-grid grid aspect-[3/4] w-[min(92vw,62svh)] sm:aspect-[16/10] sm:w-[min(92vw,140svh)] grid-cols-3 grid-rows-3 gap-2 sm:gap-3">
          {GRID.map((g, i) => (
            <figure key={g.place} className={`zoom-tile relative ${i === 4 ? "is-center" : ""}`}>
              <Shot
                photo={g.photo}
                sizes="(max-width: 768px) 100vw, 50vw"
                className="size-full rounded-md"
                decorative={i !== 4}
              />
              <figcaption
                translate="no"
                className="zoom-label absolute bottom-2 left-2 rounded-full bg-paper/90 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-ink sm:text-xs"
              >
                {g.place}
              </figcaption>
            </figure>
          ))}
        </div>

        {/* Texto sobre la foto a pantalla completa */}
        <div className="zoom-intro pointer-events-none absolute inset-0 grid place-items-center bg-gradient-to-t from-ink/70 via-ink/20 to-ink/40 px-4 text-center text-paper">
          <p className="display max-w-4xl text-[clamp(2.4rem,7vw,6.5rem)] uppercase">
            Every great night ends with one bill.
          </p>
        </div>

        {/* Al terminar: la grilla completa */}
        <div className="zoom-outro pointer-events-none absolute inset-x-0 bottom-6 px-4 text-center sm:bottom-10">
          <p className="inline-block rounded-full bg-paper px-5 py-2.5 font-mono text-xs uppercase tracking-[0.16em] text-ink sm:text-sm">
            …and one person stuck paying for everyone
          </p>
        </div>
      </div>
    </section>
  );
}
