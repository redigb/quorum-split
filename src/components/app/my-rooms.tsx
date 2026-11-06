"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";

/**
 * "Tus salas": el enlace del anfitrión ES su llave (no hay cuentas). Lo guardamos en este navegador
 * para que, si cierra la pestaña, pueda volver a su sala. El almacenamiento puede estar bloqueado
 * (modo privado): todo va en try/catch y la app funciona igual sin él.
 */
const KEY = "quorum.rooms";
const EVENT = "quorum:rooms";

export interface SavedRoom {
  code: string;
  hostPath: string; // /r/CODE/host?t=TOKEN
  merchant: string | null;
  createdAt: number;
  /** Enlaces de cada participante: el servidor solo guarda su hash, así que se conservan aquí para recordar. */
  links?: { id: string; name: string; url: string }[];
}

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveRoom(room: SavedRoom) {
  try {
    const rest = parse(read()).filter((r) => r.code !== room.code);
    localStorage.setItem(KEY, JSON.stringify([room, ...rest].slice(0, 10)));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

export function findRoom(code: string): SavedRoom | undefined {
  return parse(read()).find((r) => r.code === code);
}

/** Token privado de esta persona en la mesa (se guarda al unirse; es lo que la identifica sin cuenta). */
export function getMyToken(code: string): string | null {
  try {
    return localStorage.getItem(`quorum.me.${code.toUpperCase()}`);
  } catch {
    return null;
  }
}
export function saveMyToken(code: string, token: string) {
  try {
    localStorage.setItem(`quorum.me.${code.toUpperCase()}`, token);
  } catch {
    /* sin almacenamiento: tendrá que unirse de nuevo si recarga */
  }
}

function parse(raw: string): SavedRoom[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

export function MyRooms() {
  const raw = useSyncExternalStore(subscribe, read, () => "");
  const rooms = useMemo(() => parse(raw), [raw]);
  if (rooms.length === 0) return null;

  return (
    <section aria-labelledby="my-rooms" className="mt-12">
      <h2 id="my-rooms" className="mb-3 font-mono text-[11px] uppercase tracking-wide text-muted">
        Your rooms
      </h2>
      <ul className="space-y-2">
        {rooms.map((r) => (
          <li key={r.code}>
            <Link
              href={r.hostPath}
              className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-paper-2 px-4 py-3 transition-colors hover:bg-paper-3"
            >
              <span className="min-w-0">
                <span className="block truncate text-[15px]">{r.merchant ?? "Shared bill"}</span>
                <span translate="no" className="font-mono text-xs text-muted">
                  {r.code} · {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </span>
              <ArrowUpRight aria-hidden className="size-4 shrink-0 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Tras iniciar sesión: asocia a la cuenta las salas guardadas en este dispositivo. Devuelve cuántas se reclamaron. */
export async function claimLocalRooms(sessionToken: string): Promise<number> {
  let claimed = 0;
  for (const r of parse(read())) {
    const hostToken = new URL(r.hostPath, "http://x").searchParams.get("t");
    if (!hostToken) continue;
    try {
      const res = await fetch(`/api/rooms/${r.code}/claim`, {
        method: "POST",
        headers: { authorization: `Bearer ${hostToken}`, "x-session": sessionToken },
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && !body.already) claimed++;
    } catch {
      /* se reintenta la próxima vez que abra el panel */
    }
  }
  return claimed;
}
