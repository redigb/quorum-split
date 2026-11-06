import { z } from "zod";
import { guard } from "@/server/auth";
import { db } from "@/server/db/client";

const Body = z.object({ itemId: z.string(), taking: z.boolean(), participantId: z.string().optional() });

/** "Esto lo consumí yo": marca o desmarca un ítem mientras la mesa está abierta. Cada persona solo mueve lo suyo. */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const g = await guard(request, code, "any");
  if (!g.ok) return g.response;
  const { room, who } = g;
  if (room.status !== "DRAFT") return Response.json({ error: "table_closed" }, { status: 409 });

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  // Cada quien marca lo suyo; el anfitrión puede marcar por alguien que no tiene el teléfono a mano.
  const target = who.role === "host" ? body.data.participantId : who.participantId;
  if (!target || !room.participants.some((p) => p.id === target)) return Response.json({ error: "forbidden" }, { status: 403 });
  if (!room.bill.items.some((i) => i.id === body.data.itemId)) return Response.json({ error: "unknown_item" }, { status: 404 });

  const q = body.data.taking
    ? db().from("item_assignments").upsert({ item_id: body.data.itemId, participant_id: target, weight: 1 }, { onConflict: "item_id,participant_id" })
    : db().from("item_assignments").delete().eq("item_id", body.data.itemId).eq("participant_id", target);
  const { error } = await q;
  if (error) {
    console.error("take", error);
    return Response.json({ error: "take_failed" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
