"use client";

import { Check, Lock, Send } from "lucide-react";
import { useRef } from "react";
import { Avatar } from "./Avatar";
import { BILL, NAIVE_EACH, PEOPLE, SPLIT, localLabel, money, shareOf } from "./demo-bill";
import { MOTION_OK, gsap, useGSAP } from "./gsap";
import { PHOTOS } from "./photos";
import { Shot } from "./Shot";

const personById = Object.fromEntries(PEOPLE.map((p) => [p.id, p]));
const maxShare = Math.max(...SPLIT.shares.map((s) => s.totalCents), NAIVE_EACH);

/**
 * Regla de estas escenas: el estado por defecto del HTML es el estado FINAL (se ve completo sin JS
 * o con movimiento reducido). GSAP solo anima "desde" un estado inicial cuando entran en pantalla.
 * Los elementos con `rotate-*` de Tailwind NO se animan con GSAP (lo pisaría): se anima un hijo.
 */

/* ───────────── 01 · Snap it ───────────── */
export function SceneSnap() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const tl = gsap.timeline({ scrollTrigger: { trigger: root.current, start: "top 70%", once: true } });
        tl.from(".snap-paper", { y: 90, autoAlpha: 0, duration: 1, ease: "expo.out" })
          .from(".snap-corner", { scale: 1.6, autoAlpha: 0, duration: 0.6, stagger: 0.05, ease: "back.out(2)" }, 0.2)
          .fromTo(
            ".snap-scan",
            { yPercent: -100, autoAlpha: 1 },
            { yPercent: 1250, duration: 2.1, ease: "sine.inOut" },
            0.9,
          )
          .from(
            ".snap-box",
            {
              scaleX: 0,
              autoAlpha: 0,
              transformOrigin: "left center",
              duration: 0.35,
              stagger: 0.22,
              ease: "power2.out",
            },
            1.05,
          )
          .from(".snap-amt", { color: "#ffc765", duration: 0.4, stagger: 0.22 }, 1.15)
          .to(".snap-scan", { autoAlpha: 0, duration: 0.3 }, 3.0)
          .from(".snap-ok", { y: 14, autoAlpha: 0, duration: 0.6, ease: "back.out(2)" }, 3.0);
      });
    },
    { scope: root },
  );

  return (
    <div ref={root} className="relative isolate h-full min-h-[22rem] overflow-hidden rounded-2xl bg-ink">
      <Shot
        photo={PHOTOS.candlelit}
        decorative
        sizes="(max-width:768px) 100vw, 45vw"
        className="absolute! inset-0 size-full"
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/45 to-ink/80" />

      {/* Visor de cámara */}
      {[
        "left-4 top-4 border-l-2 border-t-2",
        "right-4 top-4 border-r-2 border-t-2",
        "bottom-4 left-4 border-b-2 border-l-2",
        "bottom-4 right-4 border-b-2 border-r-2",
      ].map((c) => (
        <span key={c} aria-hidden className={`snap-corner absolute size-7 rounded-sm border-paper/90 ${c}`} />
      ))}
      <p className="absolute left-1/2 top-4 -translate-x-1/2 font-mono text-[11px] uppercase tracking-[0.2em] text-paper/80">
        <span className="mr-2 inline-block size-1.5 animate-pulse rounded-full bg-danger align-middle" />
        Reading receipt
      </p>

      <div className="absolute inset-0 grid place-items-center px-5 py-12">
        <div className="-rotate-3">
          <div className="snap-paper relative w-[min(100%,19rem)] overflow-hidden rounded-t-sm bg-white px-5 pb-8 pt-5 font-mono text-[12.5px] text-ink shadow-[0_30px_70px_-20px_#000c] zigzag-b">
            <div
              aria-hidden
              className="snap-scan pointer-events-none absolute inset-x-0 top-0 z-10 h-8 bg-gradient-to-b from-transparent via-accent/35 to-transparent"
              style={{ visibility: "hidden" }}
            />
            <p className="text-center font-semibold tracking-[0.2em]">TASCA DO CHICO</p>
            <p className="text-center text-muted">Lisboa · Table 12</p>
            <div className="my-3 border-t border-dashed border-ink/25" />
            <ul className="space-y-1.5">
              {BILL.items.map((it) => (
                <li key={it.id} className="relative flex justify-between px-1">
                  <span
                    aria-hidden
                    className="snap-box absolute -inset-x-0.5 -inset-y-px rounded-[3px] border-[1.5px] border-accent bg-accent/10"
                  />
                  <span className="relative">{it.name}</span>
                  <span className="snap-amt num relative">{money(it.lineTotalCents)}</span>
                </li>
              ))}
            </ul>
            <div className="my-3 border-t border-dashed border-ink/25" />
            <p className="flex justify-between font-semibold">
              <span>TOTAL</span>
              <span className="num">{money(SPLIT.grandTotalCents)}</span>
            </p>
          </div>
        </div>
      </div>

      <p className="snap-ok absolute inset-x-4 bottom-4 flex items-center justify-center gap-2 rounded-full bg-ok px-4 py-2 font-mono text-[12px] text-white shadow-lg">
        <Check aria-hidden className="size-4" strokeWidth={3} /> 7 lines read · matches printed total to the cent
      </p>
    </div>
  );
}

/* ───────────── 02 · Split it fair ───────────── */
export function SceneSplit() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        ScrollTriggerOnce(root.current!, () => {
          // Medir ANTES de crear la animación (las "from" mueven los elementos al instante)
          const chips = gsap.utils.toArray<HTMLElement>(".split-chip", root.current);
          const moves = chips.map((chip) => {
            const src = root
              .current!.querySelector<HTMLElement>(`[data-tray="${chip.dataset.who}"]`)!
              .getBoundingClientRect();
            const dst = chip.getBoundingClientRect();
            return { chip, dx: src.left - dst.left, dy: src.top - dst.top, row: chip.closest(".split-row") };
          });

          const tl = gsap.timeline();
          tl.from(".split-tray > *", { y: -20, autoAlpha: 0, stagger: 0.07, duration: 0.5, ease: "back.out(2)" });
          // Cada ficha vuela desde su avatar de la bandeja hasta su renglón, que se ilumina al llegar
          moves.forEach(({ chip, dx, dy, row }, i) => {
            const t = 0.7 + i * 0.16;
            tl.from(chip, { x: dx, y: dy, scale: 1.5, duration: 0.8, ease: "power3.inOut" }, t);
            tl.from(
              row,
              { backgroundColor: "rgba(255,199,101,.75)", duration: 0.8, clearProps: "backgroundColor" },
              t + 0.5,
            );
          });
          tl.from(
            ".split-bar",
            { scaleX: 0, transformOrigin: "left center", duration: 1, stagger: 0.1, ease: "expo.out" },
            1.4,
          )
            .from(".split-amt", { autoAlpha: 0, x: -8, duration: 0.5, stagger: 0.1 }, 1.6)
            .from(".split-naive", { autoAlpha: 0, y: 8, duration: 0.5 }, 2.3);
        });
      });
    },
    { scope: root },
  );

  return (
    <div ref={root} className="relative h-full min-h-[22rem] rounded-2xl bg-paper p-4 text-ink shadow-inner sm:p-5">
      <div className="split-tray mb-3 flex items-center gap-2 rounded-full bg-paper-3 p-1.5 pr-4">
        {PEOPLE.map((p) => (
          <span key={p.id} data-tray={p.id} className="inline-flex">
            <Avatar person={p} size={30} className="ring-paper-3" />
          </span>
        ))}
        <span className="ml-auto font-mono text-[11px] uppercase tracking-wider text-muted">tap who had what</span>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.15fr_1fr]">
        <ul className="space-y-1 font-mono text-[12px]">
          {BILL.items.map((it) => (
            <li key={it.id} className="split-row flex items-center gap-2 rounded-md bg-paper-2 px-2.5 py-1.5">
              <span className="min-w-0 flex-1 truncate">{it.name}</span>
              <span className="flex -space-x-1.5">
                {it.assignees.map((a) => (
                  <span key={a.participantId} data-who={a.participantId} className="split-chip inline-flex">
                    <Avatar person={personById[a.participantId]} size={18} className="ring-paper-2" />
                  </span>
                ))}
              </span>
              <span className="num w-14 text-right">{money(it.lineTotalCents)}</span>
            </li>
          ))}
          {BILL.charges.map((c) => (
            <li key={c.label} className="flex justify-between px-2.5 text-muted">
              <span>{c.label} · by what you ordered</span>
              <span className="num">{money(c.amountCents)}</span>
            </li>
          ))}
        </ul>

        <div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted">Each person’s fair share</p>
          <ul className="space-y-2.5">
            {PEOPLE.map((p) => (
              <li key={p.id} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-2 text-xs">
                <Avatar person={p} size={20} />
                <span className="relative h-2.5 rounded-full bg-paper-3">
                  <span
                    className="split-bar absolute inset-y-0 left-0 rounded-full"
                    style={{ width: `${(shareOf(p.id) / maxShare) * 100}%`, background: p.hue }}
                  />
                  <span
                    aria-hidden
                    className="absolute -top-1 h-[18px] w-px bg-ink/55"
                    style={{ left: `${(NAIVE_EACH / maxShare) * 100}%` }}
                  />
                </span>
                <span className="split-amt num font-mono text-[13px] font-semibold">{money(shareOf(p.id))}</span>
              </li>
            ))}
          </ul>
          <p className="split-naive mt-3 rounded-md bg-hold/40 px-2.5 py-1.5 font-mono text-[11px] leading-snug">
            │ = {money(NAIVE_EACH)} each if split evenly. Aiko would overpay {money(NAIVE_EACH - shareOf("ai"))}.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ───────────── 03 · Send the room ───────────── */
export function SceneSend() {
  const root = useRef<HTMLDivElement>(null);
  const me = PEOPLE[0];

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.set(".send-cta-idle", { autoAlpha: 1 });
        gsap.set(".send-cta-done", { autoAlpha: 0 });
        gsap
          .timeline({ scrollTrigger: { trigger: root.current, start: "top 70%", once: true } })
          .from(".send-phone", { y: 120, rotation: 6, autoAlpha: 0, duration: 1.1, ease: "expo.out" })
          .from(
            ".send-bubble",
            { scale: 0.4, autoAlpha: 0, transformOrigin: "left bottom", duration: 0.7, ease: "back.out(2.2)" },
            0.6,
          )
          .from(
            ".send-bubble-2",
            { scale: 0.4, autoAlpha: 0, transformOrigin: "left bottom", duration: 0.7, ease: "back.out(2.2)" },
            1.1,
          )
          .from(".send-dot", { scale: 0, autoAlpha: 0, stagger: 0.12, duration: 0.4, ease: "back.out(3)" }, 1.4)
          .to(".send-cta-idle", { autoAlpha: 0, duration: 0.25 }, 2.8)
          .to(".send-cta-done", { autoAlpha: 1, duration: 0.4 }, 2.9)
          .from(".send-hold", { autoAlpha: 0, y: 10, duration: 0.5 }, 3.1);
      });
    },
    { scope: root },
  );

  return (
    <div
      ref={root}
      className="relative isolate grid h-full min-h-[22rem] place-items-center overflow-hidden rounded-2xl bg-ink px-4 py-8 max-sm:pb-14"
    >
      <Shot
        photo={PHOTOS.sunlit}
        decorative
        sizes="(max-width:768px) 100vw, 45vw"
        className="absolute! inset-0 size-full opacity-35"
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink via-ink/60 to-ink/30" />

      <div className="relative flex w-full max-w-md items-center justify-center gap-4 sm:gap-6">
        {/* Chat: el link llega por WhatsApp o donde sea */}
        <div className="hidden w-44 shrink-0 space-y-2 sm:block">
          <div className="send-bubble rounded-2xl rounded-bl-sm bg-[#d9fdd3] p-2.5 text-[12px] leading-snug text-ink shadow-lg">
            <p className="font-semibold">Lucía</p>
            <p>🍽 Tasca do Chico — your share is {money(shareOf("lu"))}</p>
            <p className="mt-1 truncate font-mono text-[11px] text-[#027eb5] underline">quorum.app/r/7fk2q</p>
          </div>
          <div className="send-bubble-2 rounded-2xl rounded-bl-sm bg-[#d9fdd3] p-2.5 text-[12px] text-ink shadow-lg">
            <p>no app, no sign-up. just tap 🙌</p>
          </div>
          <div className="flex -space-x-2 pl-1">
            {PEOPLE.map((p) => (
              <span key={p.id} className="send-dot inline-flex">
                <Avatar person={p} size={22} className="ring-ink" />
              </span>
            ))}
          </div>
        </div>

        {/* Teléfono */}
        <div className="-rotate-2">
          <div className="send-phone relative w-[15.5rem] rounded-[2.4rem] border-[7px] border-[#2b2623] bg-paper p-4 pb-5 text-ink shadow-[0_40px_80px_-20px_#000d]">
            <span aria-hidden className="absolute left-1/2 top-2 h-4 w-16 -translate-x-1/2 rounded-full bg-[#2b2623]" />
            <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Tasca do Chico · Lisboa</p>
            <p className="mt-2 text-sm font-semibold">Hi {me.name}, your share</p>
            <p className="num mt-1 font-mono text-[2.6rem] font-semibold leading-none tracking-tight">
              {money(shareOf(me.id))}
            </p>
            <p className="mt-1 font-mono text-[11px] text-muted">{localLabel(me.id)} · 4 items + tax &amp; tip</p>

            <ul className="mt-3 space-y-1 border-t border-dashed border-ink/20 pt-2 font-mono text-[11px]">
              {SPLIT.shares[0].lines.slice(0, 3).map((l) => (
                <li key={l.label} className="flex justify-between">
                  <span className="truncate pr-2">{l.label}</span>
                  <span className="num">{money(l.amountCents)}</span>
                </li>
              ))}
              <li className="text-muted">+ more…</li>
            </ul>

            {/* Botón dorado de PayPal (estilo, sin logo) → cambia a "hold placed" */}
            <div className="relative mt-4 h-11">
              <span className="send-cta-idle invisible absolute inset-0 grid place-items-center rounded-full bg-[#ffc439] text-sm font-semibold text-[#111]">
                Authorize with PayPal
              </span>
              <span className="send-cta-done absolute inset-0 flex items-center justify-center gap-1.5 rounded-full bg-ok text-sm font-semibold text-white">
                <Check aria-hidden className="size-4" strokeWidth={3} /> Hold placed
              </span>
            </div>
            <p className="send-hold mt-3 flex items-start gap-1.5 text-[11px] leading-snug text-muted">
              <Lock aria-hidden className="mt-0.5 size-3 shrink-0" /> You won’t be charged until everyone confirms.
            </p>
          </div>
        </div>
      </div>

      <p className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-paper/60 sm:hidden">
        <Send aria-hidden className="size-3" /> link sent to 5 people
      </p>
    </div>
  );
}

/** Ejecuta `fn` una sola vez cuando el elemento entra en pantalla (ya medido, para poder calcular posiciones). */
function ScrollTriggerOnce(el: HTMLElement, fn: () => void) {
  gsap.timeline({ scrollTrigger: { trigger: el, start: "top 70%", once: true, onEnter: fn } });
}
