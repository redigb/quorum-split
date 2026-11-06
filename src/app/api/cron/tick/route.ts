import { timingSafeEqual } from "node:crypto";
import { db } from "@/server/db/client";
import { loadRoomById } from "@/server/db/rooms";
import { applyEvent } from "@/server/room-actions";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // sin secreto configurado, el endpoint queda cerrado
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

/** Vence las salas abiertas cuyo plazo ya pasó: anula todas las retenciones y nadie paga. Vercel Cron lo llama. */
export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await db()
    .from("rooms")
    .select("id")
    .eq("status", "OPEN")
    .lt("deadline_at", new Date().toISOString());
  if (error) return Response.json({ error: "query_failed" }, { status: 500 });

  const expired: string[] = [];
  const failed: string[] = [];
  for (const { id } of data ?? []) {
    try {
      const room = await loadRoomById(id);
      if (room) await applyEvent(room, { type: "DEADLINE_REACHED" }, "system");
      expired.push(id);
    } catch (e) {
      console.error("cron expire", id, e);
      failed.push(id);
    }
  }
  return Response.json({ expired: expired.length, failed: failed.length });
}
