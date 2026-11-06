"use client";

import { useEffect, useState } from "react";
import { LuckyDraw } from "@/components/landing/LuckyDraw";
import { formatMoney, type Currency } from "@/core/money";

const HUES = ["#3d2fa9", "#c2410c", "#0f766e", "#be185d", "#a16207", "#1d4ed8", "#15803d", "#7e22ce"];
const key = (code: string) => `quorum.draw.${code}`;

function seen(code: string) {
  try {
    return localStorage.getItem(key(code)) === "1";
  } catch {
    return false;
  }
}
function markSeen(code: string) {
  try {
    localStorage.setItem(key(code), "1");
  } catch {
    /* sin almacenamiento: se vería otra vez al recargar, no pasa nada */
  }
}

interface RoomLike {
  status: string;
  mode?: "fair" | "lucky";
  loserId?: string | null;
  currency: Currency;
  participants: { id: string; name: string }[];
}

/**
 * El sorteo de la landing, en la app: se barajan las cartas, giran y se van descartando hasta que queda la de quien paga.
 * Se muestra UNA vez por dispositivo cuando la sala ya fue sorteada y sigue abierta; el ganador lo decidió el servidor.
 */
export function DrawOverlay({ code, room, totalCents }: { code: string; room: RoomLike; totalCents: number }) {
  const eligible = room.mode === "lucky" && !!room.loserId && room.status === "OPEN";
  const [open, setOpen] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (!eligible || seen(code)) return;
    const t = window.setTimeout(() => {
      setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      markSeen(code);
      setOpen(true);
    }, 0);
    return () => window.clearTimeout(t);
  }, [eligible, code]);

  if (!open) return null;
  const winner = Math.max(0, room.participants.findIndex((p) => p.id === room.loserId));
  const people = room.participants.map((p, i) => ({ id: p.id, name: p.name, hue: HUES[i % HUES.length] }));
  const close = () => setOpen(false);

  return (
    <div role="dialog" aria-modal="true" aria-label="The draw" className="fade-in fixed inset-0 z-[100] grid place-items-center bg-ink/92 p-4 backdrop-blur-sm">
      <div className="w-full max-w-[520px]">
        <p className="mb-4 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-paper/60">Feeling lucky · drawing…</p>
        <div className="relative mx-auto aspect-square w-full">
          <LuckyDraw
            winner={winner}
            total={totalCents}
            label={formatMoney(totalCents, room.currency, "en-US")}
            people={people}
            instant={reduced}
            onDone={() => window.setTimeout(close, reduced ? 1800 : 1600)}
          />
        </div>
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={close}
            className="rounded-full border border-paper/25 px-5 py-2.5 text-sm text-paper transition-colors hover:bg-paper/10"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
