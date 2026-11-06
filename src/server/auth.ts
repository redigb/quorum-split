import "server-only";
import { db } from "./db/client";
import { identify, loadRoom, type LoadedRoom } from "./db/rooms";
import { applyEvent } from "./room-actions";

/** El token viaja en `Authorization: Bearer <token>`, nunca en la URL de la API (los logs la guardan). */
export function bearer(request: Request): string | null {
  const h = request.headers.get("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7).trim() || null : null;
}

/** Usuario de la sesión (Supabase Auth). Viaja en `x-session` para no mezclarse con los tokens de sala. */
export async function sessionUser(request: Request): Promise<string | null> {
  const jwt = request.headers.get("x-session");
  if (!jwt) return null;
  const { data, error } = await db().auth.getUser(jwt);
  return error ? null : (data.user?.id ?? null);
}

type Guard =
  | { ok: true; room: LoadedRoom; who: NonNullable<ReturnType<typeof identify>> }
  | { ok: false; response: Response };

/** Carga la sala y exige un rol. 404 tanto si no existe como si el token no sirve (no revela salas). */
export async function guard(request: Request, code: string, role: "host" | "any"): Promise<Guard> {
  let room = await loadRoom(code);
  // Expiración perezosa: el cron gratuito de Vercel corre 1 vez al día, así que una sala vencida
  // se expira (y se liberan las retenciones) en cuanto alguien la consulta.
  if (room && room.status === "OPEN" && room.deadlineAt && new Date(room.deadlineAt).getTime() <= Date.now()) {
    try {
      await applyEvent(room, { type: "DEADLINE_REACHED" }, "system");
    } catch (e) {
      console.error("lazy expire", e);
    }
    room = await loadRoom(code);
  }
  let who = room ? identify(room, bearer(request)) : null;
  // Sin token de sala: la dueña de la sala (cuenta) también es anfitriona, desde cualquier dispositivo.
  if (room && !who && room.ownerId) {
    const uid = await sessionUser(request);
    if (uid && uid === room.ownerId) who = { role: "host", participantId: null };
  }
  if (!room || !who) return { ok: false, response: Response.json({ error: "not_found" }, { status: 404 }) };
  if (role === "host" && who.role !== "host") {
    return { ok: false, response: Response.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ok: true, room, who };
}
