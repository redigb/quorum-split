import type { ReactNode } from "react";

/** Marquesina infinita en CSS. El contenido se duplica para el bucle; la copia es aria-hidden. */
export function Marquee({
  children,
  duration = 40,
  className = "",
  label,
}: {
  children: ReactNode;
  duration?: number;
  className?: string;
  label: string;
}) {
  return (
    <div
      className={`marquee overflow-hidden ${className}`}
      style={{ "--marquee-duration": `${duration}s` } as React.CSSProperties}
      role="marquee"
      aria-label={label}
    >
      <div className="marquee-track">
        <div className="flex shrink-0 items-center">{children}</div>
        <div className="flex shrink-0 items-center" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  );
}
