"use client";

import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost";

/** Píldora de la landing: tinta -> violeta al pasar. `busy` bloquea y muestra el spinner propio. */
export function Button({
  variant = "primary",
  busy = false,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  const look =
    variant === "primary"
      ? "bg-ink text-paper hover:bg-accent disabled:hover:bg-ink"
      : "border border-line hover:bg-paper-2";
  return (
    <button
      type="button"
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[15px] transition-[background-color,transform,opacity] duration-200 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 ${look} ${className}`}
      {...rest}
    >
      {/* El spinner siempre está montado y solo se oculta: así React no inserta nodos junto al texto
          (el traductor de Chrome reemplaza esos nodos y rompía con "insertBefore"). */}
      <Loader2 aria-hidden className={`size-4 animate-spin ${busy ? "" : "hidden"}`} />
      <span>{children}</span>
    </button>
  );
}
