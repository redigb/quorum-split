import { z } from "zod";
import { guard } from "@/server/auth";
import { db } from "@/server/db/client";

const Body = z.object({ mode: z.enum(["fair", "lucky"]) });

/** El anfitrión elige cómo se reparte: justo (cada quien lo suyo) o "Feeling lucky" (sorteo). Reinicia los "acepto jugar". */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const g = await guard(request, code, "host");
  if (!g.ok) return g.response;
  if (g.room.status !== "DRAFT") return Response.json({ error: "table_closed" }, { status: 409 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  if (g.room.mode === body.data.mode) return Response.json({ ok: true });

  const up = await db().from("rooms").update({ mode: body.data.mode }).eq("id", g.room.id);
  const reset = await db().from("participants").update({ lucky_ok: false }).eq("room_id", g.room.id);
  if (up.error || reset.error) return Response.json({ error: "mode_failed" }, { status: 500 });
  return Response.json({ ok: true });
}
