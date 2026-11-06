import { z } from "zod";
import { db } from "@/server/db/client";
import { hashToken, newToken } from "@/server/db/tokens";
import { loadRoom, logEvent } from "@/server/db/rooms";

const MAX_PEOPLE = 20;
const Body = z.object({ name: z.string().trim().min(1).max(60) });

/** Unirse a la mesa con el enlace compartido: solo nombre, sin cuenta. Devuelve el token privado de esa persona. */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  const room = await loadRoom(code);
  if (!room) return Response.json({ error: "not_found" }, { status: 404 });
  if (room.status !== "DRAFT") return Response.json({ error: "table_closed" }, { status: 409 });
  if (room.participants.length >= MAX_PEOPLE) return Response.json({ error: "table_full" }, { status: 409 });
  const name = body.data.name;
  if (room.participants.some((p) => p.name.trim().toLowerCase() === name.toLowerCase())) {
    return Response.json({ error: "name_taken" }, { status: 409 });
  }

  const token = newToken();
  const { data, error } = await db()
    .from("participants")
    .insert({ room_id: room.id, name, is_host: false, access_token_hash: hashToken(token) })
    .select("id")
    .single();
  if (error) {
    console.error("join", error);
    return Response.json({ error: "join_failed" }, { status: 500 });
  }
  await logEvent(room.id, "PARTICIPANT_JOINED", `participant:${data.id}`, { name });
  return Response.json({ participantId: data.id, token }, { status: 201 });
}
