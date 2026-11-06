import { toCents } from "@/core/money";
import { TransitionError } from "@/core/room-machine";
import { guard } from "@/server/auth";
import { db } from "@/server/db/client";
import { authorizeOrder, PayPalError, voidAuthorization } from "@/server/paypal/client";
import { applyEvent } from "@/server/room-actions";

/** Tras aprobar en PayPal: retiene el dinero (no lo cobra). Si es el último, la sala se financia y se cobra a todos. */
export async function POST(request: Request, ctx: { params: Promise<{ code: string; orderId: string }> }) {
  const { code, orderId } = await ctx.params;
  const g = await guard(request, code, "any");
  if (!g.ok) return g.response;
  const { room, who } = g;
  if (!who.participantId) return Response.json({ error: "participant_token_required" }, { status: 403 });

  const { data: pay } = await db()
    .from("paypal_payments")
    .select("*")
    .eq("order_id", orderId)
    .eq("room_id", room.id)
    .eq("participant_id", who.participantId)
    .maybeSingle();
  if (!pay) return Response.json({ error: "not_found" }, { status: 404 });
  if (pay.status === "AUTHORIZED") return Response.json({ status: "AUTHORIZED" }); // idempotente

  try {
    const auth = await authorizeOrder(orderId);

    // Defensa: el monto autorizado debe ser EXACTAMENTE el esperado y la versión de montos vigente.
    const me = room.participants.find((p) => p.id === who.participantId)!;
    const paid = toCents(auth.amount.value);
    if (paid !== me.shareCents || pay.shares_version !== room.sharesVersion || auth.amount.currency_code !== room.bill.currency) {
      await voidAuthorization(auth.authorizationId);
      await db().from("paypal_payments").update({ status: "VOIDED" }).eq("order_id", orderId);
      return Response.json({ error: "amount_changed", message: "Tu monto cambió; vuelve a confirmar." }, { status: 409 });
    }

    await db()
      .from("paypal_payments")
      .update({ status: "AUTHORIZED", authorization_id: auth.authorizationId, updated_at: new Date().toISOString() })
      .eq("order_id", orderId);

    const state = await applyEvent(room, { type: "AUTHORIZED", participantId: who.participantId }, `participant:${who.participantId}`);
    return Response.json({ status: "AUTHORIZED", room: state.status });
  } catch (e) {
    if (e instanceof TransitionError) return Response.json({ error: "invalid_transition" }, { status: 409 });
    if (e instanceof PayPalError) {
      console.error("paypal authorize", e.body);
      return Response.json({ error: "paypal_error" }, { status: 502 });
    }
    console.error("authorize", e);
    return Response.json({ error: "authorize_failed" }, { status: 500 });
  }
}
