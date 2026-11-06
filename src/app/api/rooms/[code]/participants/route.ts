import { z } from "zod";
import { guard } from "@/server/auth";
import { db } from "@/server/db/client";
import { logEvent } from "@/server/db/rooms";
import { hashToken, newToken } from "@/server/db/tokens";

const Body = z.object({ name: z.string().trim().min(1).max(60) });

/** El anfitrión sienta a alguien a mano (no tiene el enlace o el teléfono). Devuelve su enlace privado para que pueda pagar. */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const g = await guard(request, code, "host");
  if (!g.ok) return g.response;
  const { room } = g;
  if (room.status !== "DRAFT") return Response.json({ error: "table_closed" }, { status: 409 });
  if (room.participants.length >= 20) return Response.json({ error: "table_full" }, { status: 409 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid_body" }, { status: 400 });
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
  if (error) return Response.json({ error: "add_failed" }, { status: 500 });
  await logEvent(room.id, "PARTICIPANT_JOINED", "host", { name, addedByHost: true });
  return Response.json({ id: data.id, token, url: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/r/${room.code}/p/${token}` }, { status: 201 });
}
