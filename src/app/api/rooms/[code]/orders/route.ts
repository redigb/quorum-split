import { TransitionError } from "@/core/room-machine";
import { guard } from "@/server/auth";
import { db } from "@/server/db/client";
import { createAuthorizeOrder, PayPalError } from "@/server/paypal/client";
import { applyEvent } from "@/server/room-actions";

/** El participante (por su enlace privado) abre su orden de PayPal por SU monto. El monto sale de la BD, nunca del cliente. */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const g = await guard(request, code, "any");
  if (!g.ok) return g.response;
  const { room, who } = g;
  if (!who.participantId) return Response.json({ error: "participant_token_required" }, { status: 403 });

  const me = room.participants.find((p) => p.id === who.participantId)!;
  if (room.status !== "OPEN") return Response.json({ error: "room_not_open" }, { status: 409 });
  if (me.paymentStatus === "EXEMPT" || me.shareCents <= 0) return Response.json({ error: "nothing_to_pay" }, { status: 409 });
  if (me.paymentStatus === "AUTHORIZED") return Response.json({ error: "already_authorized" }, { status: 409 });

  try {
    const order = await createAuthorizeOrder({
      roomId: room.id,
      participantId: me.id,
      amountCents: me.shareCents,
      currency: room.bill.currency,
      description: `Quorum · ${room.merchant ?? "cuenta compartida"} · ${me.name}`,
      version: room.sharesVersion,
    });

    const { error } = await db()
      .from("paypal_payments")
      .upsert(
        {
          room_id: room.id,
          participant_id: me.id,
          shares_version: room.sharesVersion,
          order_id: order.id,
          amount_cents: me.shareCents,
          currency: room.bill.currency,
          status: "CREATED",
        },
        { onConflict: "order_id", ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);

    if (me.paymentStatus !== "ORDER_CREATED") await applyEvent(room, { type: "ORDER_CREATED", participantId: me.id }, `participant:${me.id}`);
    return Response.json({ orderId: order.id, amountCents: me.shareCents, currency: room.bill.currency });
  } catch (e) {
    if (e instanceof TransitionError) return Response.json({ error: "invalid_transition" }, { status: 409 });
    if (e instanceof PayPalError) {
      console.error("paypal create order", e.body);
      return Response.json({ error: "paypal_error" }, { status: 502 });
    }
    console.error("orders", e);
    return Response.json({ error: "order_failed" }, { status: 500 });
  }
}
