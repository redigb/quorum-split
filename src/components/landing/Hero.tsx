"use client";

import { Pic } from "./Pic";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { useRef } from "react";
import { BILL, money } from "./demo-bill";
import { EASE, MOTION_OK, SplitText, gsap, useGSAP } from "./gsap";
import { Marquee } from "./Marquee";
import { PHOTOS } from "./photos";
import { Shot } from "./Shot";

const ROUTES = [
  "🇵🇪 Lima → 🇪🇸 Madrid",
  "USD",
  "🇺🇸 Austin → 🇲🇽 CDMX",
  "EUR",
  "🇯🇵 Osaka → 🇵🇹 Lisbon",
  "GBP",
  "🇧🇷 São Paulo → 🇨🇦 Toronto",
  "MXN",
  "🇦🇺 Sydney → 🇬🇧 London",
  "CAD",
];

/** Fotos que flotan alrededor del titular. `out` = hacia dónde se dispersan al hacer scroll. */
// La rotación la maneja GSAP (no clases de Tailwind): GSAP reemplaza la propiedad CSS `rotate`.
const FLOATERS = [
  {
    photo: PHOTOS.toastRed,
    cls: "left-[2%] top-[13%] w-[11vw] max-w-48 aspect-[3/4]",
    rot: -6,
    out: { x: -260, y: -120, r: -18 },
    mobile: true,
  },
  {
    photo: PHOTOS.charcuterie,
    cls: "right-[2%] top-[11%] w-[14vw] max-w-64 aspect-[4/3]",
    rot: 3,
    out: { x: 280, y: -140, r: 14 },
    mobile: true,
  },
  {
    photo: PHOTOS.nightMarket,
    cls: "left-[7%] bottom-[17%] w-[12vw] max-w-48 aspect-[3/4]",
    rot: 3,
    out: { x: -300, y: 160, r: 12 },
    mobile: false,
  },
  {
    photo: PHOTOS.cocktailsTop,
    cls: "right-[8%] bottom-[19%] w-[15vw] max-w-64 aspect-[4/3]",
    rot: -3,
    out: { x: 300, y: 180, r: -14 },
    mobile: false,
  },
];

/** Rastro del cursor: alterna fotos y renglones del ticket. */
const TRAIL_PHOTOS = [
  PHOTOS.clinkPizza,
  PHOTOS.skewers,
  PHOTOS.pizzaParty,
  PHOTOS.bar,
  PHOTOS.longTable,
  PHOTOS.sunset,
];
const TRAIL_GAP_PX = 90;

export function Hero() {
  const root = useRef<HTMLElement>(null);
  const trail = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      FLOATERS.forEach((f, i) => gsap.set(`.floater-${i}`, { rotation: f.rot }));

      mm.add(MOTION_OK, () => {
        // Titular: las líneas suben desde una máscara
        SplitText.create(".hero-title", {
          type: "lines,words",
          mask: "lines",
          autoSplit: true,
          onSplit(self) {
            gsap.set(".hero-title", { autoAlpha: 1 });
            return gsap.from(self.lines, { yPercent: 110, duration: 1.3, stagger: 0.09, ease: EASE, delay: 0.2 });
          },
        });

        gsap.from(".hero-fade", { autoAlpha: 0, y: 24, duration: 1, stagger: 0.08, ease: EASE, delay: 0.7 });

        // Las fotos entran "tiradas" sobre la mesa
        gsap.from(".floater", {
          autoAlpha: 0,
          scale: 0.4,
          rotation: (i) => FLOATERS[i].rot + gsap.utils.random(-30, 30),
          y: 80,
          duration: 1.4,
          stagger: 0.08,
          ease: "back.out(1.4)",
          delay: 0.35,
        });

        // Al hacer scroll se dispersan hacia afuera y el titular se encoge
        const tl = gsap.timeline({
          scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: 0.6 },
        });
        FLOATERS.forEach((f, i) => {
          tl.to(`.floater-${i}`, { x: f.out.x, y: f.out.y, rotation: f.rot + f.out.r, scale: 1.15, ease: "none" }, 0);
        });
        tl.to(".hero-center", { scale: 0.86, yPercent: 18, autoAlpha: 0.2, ease: "none" }, 0);

        // Parallax interno de cada foto
        gsap.utils.toArray<HTMLElement>(".floater .shot-inner").forEach((el) => {
          gsap.fromTo(
            el,
            { yPercent: -6 },
            {
              yPercent: 6,
              ease: "none",
              scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true },
            },
          );
        });
      });

      // Rastro del cursor (solo mouse/trackpad)
      mm.add(`${MOTION_OK} and (pointer: fine)`, () => {
        const hero = root.current!;
        const nodes = gsap.utils.toArray<HTMLElement>(".trail-item", trail.current);
        let i = 0;
        let last = { x: -999, y: -999 };
        let z = 1;

        const onMove = (e: PointerEvent) => {
          const r = hero.getBoundingClientRect();
          const x = e.clientX - r.left;
          const y = e.clientY - r.top;
          if (Math.hypot(x - last.x, y - last.y) < TRAIL_GAP_PX) return;
          last = { x, y };

          const el = nodes[i++ % nodes.length];
          gsap.killTweensOf(el);
          gsap
            .timeline()
            .set(el, {
              x,
              y,
              xPercent: -50,
              yPercent: -50,
              rotate: gsap.utils.random(-12, 12),
              scale: 0.5,
              autoAlpha: 1,
              zIndex: z++,
            })
            .to(el, { scale: 1, duration: 0.55, ease: "back.out(1.8)" })
            .to(el, { y: y + 90, scale: 0.8, autoAlpha: 0, duration: 0.9, ease: "power2.in" }, 0.6);
        };

        hero.addEventListener("pointermove", onMove);
        return () => hero.removeEventListener("pointermove", onMove);
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="top" className="grain relative flex min-h-svh flex-col overflow-hidden bg-paper pt-24">
      {/* Fotos flotantes */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {FLOATERS.map((f, i) => (
          <div
            key={f.photo.src}
            className={`floater floater-${i} absolute ${f.cls} ${f.mobile ? "max-md:top-auto max-md:bottom-[12%]" : "hidden md:block"} max-md:w-24`}
          >
            <Shot
              photo={f.photo}
              sizes="(max-width: 768px) 112px, 18vw"

              decorative
              className="size-full rounded-card shadow-[0_30px_60px_-25px_#17141280]"
            />
          </div>
        ))}
      </div>

      {/* Rastro del cursor */}
      <div ref={trail} aria-hidden className="pointer-events-none absolute inset-0 z-20">
        {[...BILL.items.slice(0, 6)].flatMap((it, k) => [
          <div
            key={`r${k}`}
            className="trail-item invisible absolute left-0 top-0 w-max rounded-sm bg-white px-3 pb-4 pt-2.5 font-mono text-xs shadow-[0_12px_30px_-12px_#17141240] zigzag-b"
            translate="no"
          >
            <div className="flex gap-6">
              <span>{it.name}</span>
              <span className="num">{money(it.lineTotalCents)}</span>
            </div>
          </div>,
          <div
            key={`p${k}`}
            className="trail-item invisible absolute left-0 top-0 aspect-[4/5] w-40 overflow-hidden rounded-card shadow-[0_20px_40px_-15px_#17141266]"
          >
            <Pic src={TRAIL_PHOTOS[k].src} alt="" fill sizes="160px" className="object-cover" />
          </div>,
        ])}
      </div>

      <div className="hero-center relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center max-md:-mt-10 px-4 text-center sm:px-6">
        <p
          data-reveal
          className="hero-fade mb-7 font-mono text-xs uppercase tracking-[0.18em] text-muted sm:text-[13px]"
        >
          (01) — Split payments for groups that cross borders
        </p>

        <h1 data-reveal className="hero-title display text-[clamp(3rem,8.5vw,9rem)] uppercase">
          Nobody pays <span className="text-accent">until</span> everybody pays.
        </h1>

        <p data-reveal className="hero-fade mt-8 max-w-xl text-lg leading-snug text-ink-2 sm:text-xl">
          Snap the bill. <span translate="no">Quorum</span> splits it to the cent, sends everyone a link, and only
          charges when <em className="not-italic text-accent">the whole group</em> has said yes.
        </p>

        <div data-reveal className="hero-fade mt-9 flex flex-wrap justify-center gap-3">
          <a
            href="#quorum"
            className="group inline-flex items-center gap-2 rounded-full bg-ink px-6 py-4 text-base text-paper transition-colors hover:bg-accent"
          >
            Split a bill
            <ArrowUpRight aria-hidden className="size-5 transition-transform duration-300 group-hover:rotate-45" />
          </a>
          <a
            href="#how"
            className="inline-flex items-center gap-2 rounded-full border border-ink/20 bg-paper/70 px-6 py-4 text-base backdrop-blur transition-colors hover:border-ink"
          >
            How it works
            <ArrowDown aria-hidden className="size-4" />
          </a>
        </div>
      </div>

      <div data-reveal className="hero-fade relative z-10 mt-10 border-y border-line bg-paper/80 py-4 backdrop-blur">
        <Marquee label="Supported routes and currencies" duration={45}>
          {ROUTES.map((r) => (
            <span
              key={r}
              className="flex items-center whitespace-nowrap px-6 font-mono text-sm uppercase tracking-wide text-muted"
            >
              {r}
              <span aria-hidden className="ml-12 text-accent">
                ✳
              </span>
            </span>
          ))}
        </Marquee>
      </div>
    </section>
  );
}
