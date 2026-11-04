"use client";

import { Pic } from "./Pic";
import { useRef } from "react";
import { NAIVE_EACH, money, shareOf } from "./demo-bill";
import { EASE, MOTION_OK, SplitText, gsap, useGSAP } from "./gsap";
import { PHOTOS, type Photo } from "./photos";

const PAINS: { title: string; body: string; photo: Photo }[] = [
  {
    title: "Chaos",
    photo: PHOTOS.pizzaParty,
    body: "The bill is a crumpled photo and fifteen WhatsApp messages nobody can follow.",
  },
  {
    title: "Unfair math",
    photo: PHOTOS.charcuterie,
    body: `Splitting by five, Aiko pays ${money(NAIVE_EACH)} for a ${money(1650)} risotto. Her real share is ${money(shareOf("ai"))}.`,
  },
  {
    title: "The collector",
    photo: PHOTOS.clinkPizza,
    body: "One friend pays it all, then spends two weeks chasing everyone else.",
  },
  {
    title: "The ghost",
    photo: PHOTOS.bar,
    body: "“I’ll send it tonight.” They never do. You can’t charge a promise.",
  },
  {
    title: "Disputes",
    photo: PHOTOS.toastRed,
    body: "“I didn’t drink that wine.” And nobody can prove who did.",
  },
];

export function Problem() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        SplitText.create(".problem-title", {
          type: "words",
          autoSplit: true,
          onSplit(self) {
            gsap.set(".problem-title", { autoAlpha: 1 });
            return gsap.from(self.words, {
              opacity: 0.12,
              stagger: 0.08,
              ease: "none",
              scrollTrigger: { trigger: ".problem-title", start: "top 80%", end: "bottom 45%", scrub: true },
            });
          },
        });

        gsap.utils.toArray<HTMLElement>(".pain-row").forEach((row) => {
          // Solo el contenido: el barrido de hover usa `scale` de CSS y GSAP lo pisaría.
          gsap.from(row.querySelectorAll(".pain-in"), {
            y: 40,
            autoAlpha: 0,
            duration: 1,
            stagger: 0.07,
            ease: EASE,
            scrollTrigger: { trigger: row, start: "top 88%" },
          });
        });
      });

      // Foto que sigue al cursor sobre la lista (solo mouse/trackpad)
      mm.add(`${MOTION_OK} and (pointer: fine)`, () => {
        const list = root.current!.querySelector<HTMLElement>(".pain-list")!;
        const follower = list.querySelector<HTMLElement>(".pain-follower")!;
        const imgs = gsap.utils.toArray<HTMLElement>(".pain-img", follower);
        const xTo = gsap.quickTo(follower, "x", { duration: 0.6, ease: "power3" });
        const yTo = gsap.quickTo(follower, "y", { duration: 0.6, ease: "power3" });
        const rTo = gsap.quickTo(follower, "rotation", { duration: 0.8, ease: "power3" });
        let lastX = 0;
        let current = -1;

        const move = (e: PointerEvent) => {
          const r = list.getBoundingClientRect();
          const x = e.clientX - r.left;
          xTo(x);
          yTo(e.clientY - r.top);
          rTo(gsap.utils.clamp(-12, 12, (x - lastX) * 0.6));
          lastX = x;
        };
        const show = (i: number) => {
          if (i === current) return;
          current = i;
          imgs.forEach((img, k) => {
            gsap.to(img, { autoAlpha: k === i ? 1 : 0, duration: 0.35 });
            if (k === i) gsap.fromTo(img, { scale: 1.25 }, { scale: 1, duration: 0.8, ease: EASE });
          });
        };
        const enter = () => gsap.to(follower, { autoAlpha: 1, scale: 1, duration: 0.4, ease: "back.out(1.6)" });
        const leave = () => {
          current = -1;
          gsap.to(follower, { autoAlpha: 0, scale: 0.6, duration: 0.3 });
        };
        const rows = gsap.utils.toArray<HTMLElement>(".pain-row", list);
        const rowEnter = rows.map((row, i) => () => show(i));
        rows.forEach((row, i) => row.addEventListener("pointerenter", rowEnter[i]));
        list.addEventListener("pointermove", move);
        list.addEventListener("pointerenter", enter);
        list.addEventListener("pointerleave", leave);
        return () => {
          rows.forEach((row, i) => row.removeEventListener("pointerenter", rowEnter[i]));
          list.removeEventListener("pointermove", move);
          list.removeEventListener("pointerenter", enter);
          list.removeEventListener("pointerleave", leave);
        };
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} aria-labelledby="problem-title" className="relative bg-ink py-28 text-paper sm:py-40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <p className="mb-8 font-mono text-xs uppercase tracking-[0.18em] text-paper/55 sm:text-[13px]">
          (02) — The problem
        </p>
        <h2
          id="problem-title"
          data-reveal
          className="problem-title display max-w-5xl text-[clamp(2.6rem,6.5vw,6.5rem)] uppercase"
        >
          Payments are one to one. Dinner never is.
        </h2>

        <div className="pain-list relative mt-20 sm:mt-28">
          {/* Foto flotante (desktop) */}
          <div
            aria-hidden
            className="pain-follower pointer-events-none invisible absolute left-0 top-0 z-20 -ml-32 -mt-40 hidden aspect-[4/5] w-64 overflow-hidden rounded-card shadow-2xl md:block"
            style={{ transform: "scale(.6)" }}
          >
            {PAINS.map((p) => (
              <div key={p.title} className="pain-img invisible absolute inset-0">
                <Pic src={p.photo.src} alt="" fill sizes="256px" className="object-cover" />
              </div>
            ))}
          </div>
          <ol className="border-t border-paper/15">
            {PAINS.map((p, i) => (
              <li
                key={p.title}
                className="pain-row group relative grid gap-3 overflow-hidden border-b border-paper/15 py-8 sm:grid-cols-[6rem_1fr_1.1fr] sm:items-baseline sm:gap-8 sm:py-10"
              >
                {/* barrido violeta al pasar el mouse */}
                <span
                  aria-hidden
                  className="absolute inset-0 -z-0 origin-bottom scale-y-0 bg-accent transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)] group-hover:scale-y-100"
                />
                <span className="pain-in relative font-mono text-sm text-paper/55 group-hover:text-paper/80">
                  ({String(i).padStart(2, "0")})
                </span>
                <h3 className="pain-in relative display flex items-center gap-4 text-4xl uppercase sm:text-6xl">
                  <span className="relative aspect-square w-14 shrink-0 overflow-hidden rounded-md md:hidden">
                    <Pic src={p.photo.src} alt="" fill sizes="56px" className="object-cover" />
                  </span>
                  {p.title}
                </h3>
                <p className="pain-in relative max-w-md text-lg leading-snug text-paper/75 group-hover:text-paper">
                  {p.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
