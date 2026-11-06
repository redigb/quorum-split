import { z } from "zod";
import { initialRoom, reduceRoom, TransitionError } from "@/core/room-machine";
import { computeSplit, SplitError } from "@/core/split";
import { guard } from "@/server/auth";
import { db } from "@/server/db/client";
import { logEvent } from "@/server/db/rooms";

const MAX_HOURS = 72; // "honor period" de PayPal

const Body = z.object({
  assignments: z.array(
    z.object({
      itemId: z.string(),
      assignees: z.array(z.object({ participantId: z.string(), weight: z.number().int().min(1).max(100) })).min(1),
    }),
  ),
  deadlineHours: z.number().int().min(1).max(MAX_HOURS).default(48),
  beneficiaryEmail: z.email().optional(),
});

/** Confirma asignaciones, calcula los montos con el núcleo y abre la sala. */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const g = await guard(request, code, "host");
  if (!g.ok) return g.response;
  const { room } = g;
  if (room.status !== "DRAFT") return Response.json({ error: "room_not_draft" }, { status: 409 });

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid_body", issues: body.error.issues }, { status: 400 });

  const byItem = new Map(body.data.assignments.map((a) => [a.itemId, a.assignees]));
  const people = new Set(room.participants.map((p) => p.id));
  for (const [itemId, assignees] of byItem) {
    if (!room.bill.items.some((i) => i.id === itemId) || assignees.some((a) => !people.has(a.participantId))) {
      return Response.json({ error: "unknown_item_or_participant", itemId }, { status: 400 });
    }
  }
  const bill = { ...room.bill, items: room.bill.items.map((i) => ({ ...i, assignees: byItem.get(i.id) ?? [] })) };

  try {
    // El núcleo valida: todo ítem asignado y el total cuadra al centavo con el ticket.
    const split = computeSplit(bill, room.participants);
    const payers = split.shares.filter((s) => s.totalCents > 0).map((s) => s.participantId);
    const exempt = room.participants.map((p) => p.id).filter((id) => !payers.includes(id));
    const { state } = reduceRoom(initialRoom(), { type: "LOCK_SHARES", payers, exempt });

    const d = db();
    const rows = bill.items.flatMap((i) =>
      i.assignees.map((a) => ({ item_id: i.id, participant_id: a.participantId, weight: a.weight })),
    );
    const clear = await d.from("item_assignments").delete().in("item_id", bill.items.map((i) => i.id));
    if (clear.error) throw new Error(clear.error.message);
    const ins = await d.from("item_assignments").insert(rows);
    if (ins.error) throw new Error(ins.error.message);

    for (const s of split.shares) {
      const { error } = await d
        .from("participants")
        .update({ share_cents: s.totalCents, payment_status: state.payments[s.participantId] })
        .eq("id", s.participantId);
      if (error) throw new Error(error.message);
    }

    const deadline = new Date(Date.now() + body.data.deadlineHours * 3600_000).toISOString();
    const up = await d
      .from("rooms")
      .update({
        status: state.status,
        deadline_at: deadline,
        shares_version: room.sharesVersion + 1,
        beneficiary_email: body.data.beneficiaryEmail ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", room.id)
      .eq("status", "DRAFT"); // evita doble lock concurrente
    if (up.error) throw new Error(up.error.message);

    await logEvent(room.id, "ROOM_LOCKED", "host", {
      grandTotalCents: split.grandTotalCents,
      shares: split.shares.map((s) => ({ participantId: s.participantId, totalCents: s.totalCents })),
    });

    return Response.json({
      status: state.status,
      deadlineAt: deadline,
      grandTotalCents: split.grandTotalCents,
      shares: split.shares.map((s) => ({ participantId: s.participantId, totalCents: s.totalCents, lines: s.lines })),
    });
  } catch (e) {
    if (e instanceof SplitError) return Response.json({ error: e.code, message: e.message }, { status: 422 });
    if (e instanceof TransitionError) return Response.json({ error: "invalid_transition" }, { status: 409 });
    console.error("lock", e);
    return Response.json({ error: "lock_failed" }, { status: 500 });
  }
}
