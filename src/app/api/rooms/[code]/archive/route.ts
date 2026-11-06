import { z } from "zod";
import { guard } from "@/server/auth";
import { db } from "@/server/db/client";

const Body = z.object({ archived: z.boolean() });

/** Archiva o desarchiva una sala: solo la oculta de la lista de su dueña, no borra nada. */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const g = await guard(request, code, "host");
  if (!g.ok) return g.response;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  const { error } = await db()
    .from("rooms")
    .update({ archived_at: body.data.archived ? new Date().toISOString() : null })
    .eq("id", g.room.id);
  if (error) return Response.json({ error: "archive_failed" }, { status: 500 });
  return Response.json({ ok: true });
}
