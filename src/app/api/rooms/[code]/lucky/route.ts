import { z } from "zod";
import { guard } from "@/server/auth";
import { db } from "@/server/db/client";

const Body = z.object({ ok: z.boolean() });

/** "Acepto jugar": en modo Feeling lucky el sorteo solo corre si TODOS dijeron que sí. */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const g = await guard(request, code, "any");
  if (!g.ok) return g.response;
  const { room, who } = g;
  if (!who.participantId) return Response.json({ error: "forbidden" }, { status: 403 });
  if (room.status !== "DRAFT" || room.mode !== "lucky") return Response.json({ error: "not_available" }, { status: 409 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  const { error } = await db().from("participants").update({ lucky_ok: body.data.ok }).eq("id", who.participantId);
  if (error) return Response.json({ error: "update_failed" }, { status: 500 });
  return Response.json({ ok: true });
}
