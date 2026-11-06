import { z } from "zod";
import { guard } from "@/server/auth";
import { db } from "@/server/db/client";
import { logEvent } from "@/server/db/rooms";

type Ctx = { params: Promise<{ code: string; id: string }> };

/** Quién puede tocar a quién: el anfitrión a cualquiera; cada participante, solo a sí mismo. Solo con la mesa abierta. */
async function authorize(request: Request, ctx: Ctx) {
  const { code, id } = await ctx.params;
  const g = await guard(request, code, "any");
  if (!g.ok) return { response: g.response };
  const { room, who } = g;
  const target = room.participants.find((p) => p.id === id);
  if (!target) return { response: Response.json({ error: "not_found" }, { status: 404 }) };
  if (who.role !== "host" && who.participantId !== id) return { response: Response.json({ error: "forbidden" }, { status: 403 }) };
  if (room.status !== "DRAFT") return { response: Response.json({ error: "table_closed" }, { status: 409 }) };
  return { room, target, who };
}

const Rename = z.object({ name: z.string().trim().min(1).max(60) });

export async function PATCH(request: Request, ctx: Ctx) {
  const a = await authorize(request, ctx);
  if ("response" in a) return a.response;
  const body = Rename.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  const name = body.data.name;
  if (a.room.participants.some((p) => p.id !== a.target.id && p.name.trim().toLowerCase() === name.toLowerCase())) {
    return Response.json({ error: "name_taken" }, { status: 409 });
  }
  const { error } = await db().from("participants").update({ name }).eq("id", a.target.id);
  if (error) return Response.json({ error: "update_failed" }, { status: 500 });
  await logEvent(a.room.id, "PARTICIPANT_RENAMED", a.who.role === "host" ? "host" : `participant:${a.target.id}`, { from: a.target.name, to: name });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const a = await authorize(request, ctx);
  if ("response" in a) return a.response;
  if (a.target.isHost) return Response.json({ error: "cannot_remove_organizer" }, { status: 409 });
  // Sus ítems marcados se borran en cascada: vuelven a quedar "sin marcar".
  const { error } = await db().from("participants").delete().eq("id", a.target.id);
  if (error) return Response.json({ error: "delete_failed" }, { status: 500 });
  await logEvent(a.room.id, "PARTICIPANT_REMOVED", a.who.role === "host" ? "host" : `participant:${a.target.id}`, { name: a.target.name });
  return Response.json({ ok: true });
}
