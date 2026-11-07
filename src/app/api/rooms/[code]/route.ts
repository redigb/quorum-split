import { progress, type PaymentStatus } from "@/core/room-machine";
import { computeSplit } from "@/core/split";
import { guard } from "@/server/auth";
import { db } from "@/server/db/client";

/**
 * Estado de la sala para la UI. Lo que cada rol ve:
 *  - anfitrión: todo (ítems, asignaciones, montos de cada quien)
 *  - participante: progreso, quién falta y SOLO su propio desglose (no lo que debe cada otro)
 */
export async function GET(request: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const g = await guard(request, code, "any");
  if (!g.ok) return g.response;
  const { room, who } = g;

  const payments = Object.fromEntries(room.participants.map((p) => [p.id, p.paymentStatus as PaymentStatus]));
  const split =
    room.status !== "DRAFT" && room.bill.items.every((i) => i.assignees.length > 0)
      ? computeSplit(room.bill, room.participants)
      : null;
  const isHost = who.role === "host";

  return Response.json({
    code: room.code,
    role: who.role,
    me: who.participantId,
    status: room.status,
    demo: room.participants.some((p) => p.simConfirmAt),
    mode: room.mode,
    loserId: room.loserId,
    drawProof: room.drawProof,
    merchant: room.merchant,
    currency: room.bill.currency,
    deadlineAt: room.deadlineAt,
    grandTotalCents: split?.grandTotalCents ?? null,
    progress: room.status === "DRAFT" ? null : progress({ status: room.status as never, payments, openClaims: 0 }),
    participants: room.participants.map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      luckyOk: p.luckyOk,
      paymentStatus: p.paymentStatus,
      shareCents: isHost || p.id === who.participantId ? p.shareCents : null,
    })),
    myBreakdown: split?.shares.find((s) => s.participantId === who.participantId) ?? null,
    // La mesa abierta necesita ver el ticket para marcar lo propio; los montos de los demás siguen privados.
    items: room.bill.items.map((i) => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      lineTotalCents: i.lineTotalCents,
      takenBy: i.assignees.map((a) => a.participantId),
    })),
    charges: room.bill.charges,
    billTotalCents: room.bill.items.reduce((n, i) => n + i.lineTotalCents, 0) + room.bill.charges.reduce((n, c) => n + c.amountCents, 0),
    ...(isHost ? { shares: split?.shares ?? null } : {}),
  });
}

/**
 * "Borra" una sala de DEMO: la archiva y desaparece de la lista de quien la probo. No se borra la fila: el libro mayor
 * es append-only (un trigger lo impide), y esa auditoria es parte del producto. Solo anfitrion y solo demos.
 */
export async function DELETE(request: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const g = await guard(request, code, "host");
  if (!g.ok) return g.response;
  if (!g.room.participants.some((p) => p.simConfirmAt)) return Response.json({ error: "not_a_demo" }, { status: 403 });
  const { error } = await db().from("rooms").update({ archived_at: new Date().toISOString() }).eq("id", g.room.id);
  if (error) {
    console.error("DELETE room", error.message);
    return Response.json({ error: "delete_failed" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
