"use client";

import { useRef } from "react";
import { MOTION_OK, gsap, useGSAP } from "./gsap";

/**
 * Anotación a mano alzada "pegada" sobre la página: texto manuscrito + flecha que se dibuja sola.
 * `flip` espeja la flecha (apunta a la izquierda en vez de a la derecha).
 */
export function Note({
  children,
  className = "",
  flip = false,
  rotate = -4,
}: {
  children: React.ReactNode;
  className?: string;
  flip?: boolean;
  rotate?: number;
}) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const path = root.current!.querySelectorAll<SVGPathElement>(".note-path");
        path.forEach((p) => {
          const len = p.getTotalLength();
          gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
        });
        gsap
          .timeline({ scrollTrigger: { trigger: root.current, start: "top 88%", once: true }, delay: 0.5 })
          .from(".note-text", { autoAlpha: 0, y: 10, duration: 0.6, ease: "power2.out" })
          .to(path, { strokeDashoffset: 0, duration: 0.8, ease: "power2.inOut", stagger: 0.25 }, "-=0.2");
      });
    },
    { scope: root },
  );

  return (
    <div ref={root} className={`pointer-events-none flex items-end gap-2 ${className}`} aria-hidden>
      <span className="note-text hand text-2xl sm:text-3xl" style={{ transform: `rotate(${rotate}deg)` }}>
        {children}
      </span>
      <svg
        width="74"
        height="52"
        viewBox="0 0 74 52"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`shrink-0 ${flip ? "-scale-x-100" : ""}`}
      >
        <path className="note-path" d="M3 8 C 26 2, 54 8, 66 40" />
        <path className="note-path" d="M54 36 L 66 41 L 70 28" />
      </svg>
    </div>
  );
}
