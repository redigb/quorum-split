import { progress, type PaymentStatus } from "@/core/room-machine";
import { computeSplit } from "@/core/split";
import { guard } from "@/server/auth";

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
    merchant: room.merchant,
    currency: room.bill.currency,
    deadlineAt: room.deadlineAt,
    grandTotalCents: split?.grandTotalCents ?? null,
    progress: room.status === "DRAFT" ? null : progress({ status: room.status as never, payments, openClaims: 0 }),
    participants: room.participants.map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      paymentStatus: p.paymentStatus,
      shareCents: isHost || p.id === who.participantId ? p.shareCents : null,
    })),
    myBreakdown: split?.shares.find((s) => s.participantId === who.participantId) ?? null,
    ...(isHost ? { items: room.bill.items, charges: room.bill.charges, shares: split?.shares ?? null } : {}),
  });
}
