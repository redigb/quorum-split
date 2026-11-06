import { z } from "zod";
import { guard } from "@/server/auth";
import { db } from "@/server/db/client";

const Body = z.object({ itemId: z.string(), taking: z.boolean() });

/** "Esto lo consumí yo": marca o desmarca un ítem mientras la mesa está abierta. Cada persona solo mueve lo suyo. */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const g = await guard(request, code, "any");
  if (!g.ok) return g.response;
  const { room, who } = g;
  if (who.role !== "participant" || !who.participantId) return Response.json({ error: "forbidden" }, { status: 403 });
  if (room.status !== "DRAFT") return Response.json({ error: "table_closed" }, { status: 409 });

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  if (!room.bill.items.some((i) => i.id === body.data.itemId)) return Response.json({ error: "unknown_item" }, { status: 404 });

  const q = body.data.taking
    ? db().from("item_assignments").upsert({ item_id: body.data.itemId, participant_id: who.participantId, weight: 1 }, { onConflict: "item_id,participant_id" })
    : db().from("item_assignments").delete().eq("item_id", body.data.itemId).eq("participant_id", who.participantId);
  const { error } = await q;
  if (error) {
    console.error("take", error);
    return Response.json({ error: "take_failed" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
