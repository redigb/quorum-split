"use client";

import { Pic } from "./Pic";
import { ArrowUpRight } from "lucide-react";
import { useRef } from "react";
import { MOTION_OK, gsap, useGSAP } from "./gsap";
import { Marquee } from "./Marquee";
import { PHOTOS } from "./photos";
import Link from "next/link";

const RING = [
  PHOTOS.toastRed,
  PHOTOS.nightMarket,
  PHOTOS.clinkPizza,
  PHOTOS.rooftop,
  PHOTOS.charcuterie,
  PHOTOS.skewers,
  PHOTOS.champagne,
  PHOTOS.sunset,
  PHOTOS.pizzaParty,
  PHOTOS.bar,
  PHOTOS.longTable,
  PHOTOS.cocktailsTop,
];
const STEP = 360 / RING.length;

export function FinalCta() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        // Giro continuo + giro extra ligado al scroll
        const spin = gsap.to(".tornado-ring", { rotationY: "-=360", duration: 60, repeat: -1, ease: "none" });
        gsap.fromTo(
          ".tornado-tilt",
          { rotationX: -28, rotationY: 50, scale: 0.75 },
          {
            rotationX: -10,
            rotationY: -40,
            scale: 1,
            ease: "none",
            scrollTrigger: { trigger: ".tornado", start: "top bottom", end: "bottom top", scrub: 0.8 },
          },
        );
        gsap.from(".cta-in", {
          autoAlpha: 0,
          y: 40,
          stagger: 0.1,
          duration: 1,
          ease: "expo.out",
          scrollTrigger: { trigger: ".cta-in", start: "top 85%" },
        });
        return () => spin.kill();
      });
    },
    { scope: root },
  );

  return (
    <>
      <section
        ref={root}
        id="cta"
        aria-labelledby="cta-title"
        className="grain relative overflow-hidden bg-paper pt-28 sm:pt-36"
      >
        <p className="text-center font-mono text-xs uppercase tracking-[0.18em] text-muted sm:text-[13px]">
          (07) — Your next dinner
        </p>

        {/* Tornado de fotos */}
        <div aria-hidden className="tornado relative mx-auto mt-6 h-[300px] w-full sm:h-[440px]">
          <div className="tornado-ring-wrap absolute inset-0 [transform-style:preserve-3d]">
            <div
              className="tornado-tilt absolute inset-0 [transform-style:preserve-3d]"
              style={{ transform: "rotateX(-10deg)" }}
            >
              <div className="tornado-ring">
                {RING.map((p, i) => (
                  <div
                    key={p.src}
                    className="tornado-card -ml-[45px] -mt-[60px] h-[120px] w-[90px] overflow-hidden rounded-lg shadow-lg sm:-ml-[75px] sm:-mt-[100px] sm:h-[200px] sm:w-[150px] [--r:190px] sm:[--r:330px]"
                    style={{ transform: `rotateY(${i * STEP}deg) translateZ(var(--r))` }}
                  >
                    <Pic src={p.src} alt="" fill sizes="150px" className="object-cover" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-4 text-center sm:px-6">
          <h2
            id="cta-title"
            className="cta-in display mx-auto mt-6 max-w-5xl text-[clamp(2.8rem,8.5vw,8rem)] uppercase"
          >
            Stop being the <span className="text-accent">collector.</span>
          </h2>
          <div className="cta-in">
            <Link
              href="/new"
              className="group mt-10 inline-flex items-center gap-3 rounded-full bg-ink px-8 py-5 text-lg text-paper transition-colors hover:bg-accent"
            >
              Split your first bill
              <ArrowUpRight aria-hidden className="size-5 transition-transform duration-300 group-hover:rotate-45" />
            </Link>
            <p className="mt-4 text-sm text-muted">Free · no account for your friends · PayPal Sandbox demo</p>
          </div>
        </div>

        <div className="mt-24 border-t border-line py-6 sm:mt-32">
          <Marquee label="Nobody pays until everybody pays" duration={30}>
            {Array.from({ length: 3 }, (_, i) => (
              <span
                key={i}
                className="display flex items-center whitespace-nowrap px-8 text-[clamp(3rem,8vw,7rem)] uppercase"
              >
                Nobody pays until everybody pays
                <span aria-hidden className="ml-16 text-accent">
                  ✳
                </span>
              </span>
            ))}
          </Marquee>
        </div>
      </section>
    </>
  );
}
