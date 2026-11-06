import { TransitionError, type RoomEvent } from "@/core/room-machine";
import { db } from "@/server/db/client";
import { loadRoomById } from "@/server/db/rooms";
import { PayPalError, verifyWebhook, WEBHOOK_EVENTS } from "@/server/paypal/client";
import { applyEvent } from "@/server/room-actions";

interface PayPalWebhook {
  id: string;
  event_type: string;
  resource: { id?: string; custom_id?: string; status_details?: { reason?: string } };
}

/**
 * Confirma lo que PayPal nos cuenta. Seguridad: firma verificada + idempotencia por id de evento.
 * Los montos NUNCA se toman del webhook: solo avisa qué participante cambió de estado.
 */
export async function POST(request: Request) {
  const raw = await request.text();

  // Sin los 5 encabezados de firma no es PayPal: se rechaza sin gastar una llamada a su API de verificación.
  const signed = ["paypal-auth-algo", "paypal-cert-url", "paypal-transmission-id", "paypal-transmission-sig", "paypal-transmission-time"].every(
    (h) => request.headers.get(h),
  );
  if (!signed) return Response.json({ error: "invalid_signature" }, { status: 401 });

  let valid = false;
  try {
    valid = await verifyWebhook(request.headers, raw);
  } catch (e) {
    // PayPal rechaza como 400 una firma mal formada (certificado ajeno, campos inventados): es un impostor, no una caída.
    if (e instanceof PayPalError && e.status === 400) return Response.json({ error: "invalid_signature" }, { status: 401 });
    console.error("webhook verify", e);
    return Response.json({ error: "verification_unavailable" }, { status: 500 }); // PayPal reintentará
  }
  if (!valid) return Response.json({ error: "invalid_signature" }, { status: 401 });

  const event = JSON.parse(raw) as PayPalWebhook;

  // Idempotencia: si el id ya existe, PayPal está reenviando.
  const { error: dupe } = await db()
    .from("webhook_events")
    .insert({ id: event.id, event_type: event.event_type, payload: event });
  if (dupe) {
    if (dupe.code === "23505") return Response.json({ ok: true, duplicate: true });
    console.error("webhook store", dupe);
    return Response.json({ error: "store_failed" }, { status: 500 });
  }

  const mapped = WEBHOOK_EVENTS[event.event_type as keyof typeof WEBHOOK_EVENTS];
  const [roomId, participantId] = (event.resource.custom_id ?? "").split(":");
  if (!mapped || !roomId || !participantId) return markDone(event.id); // evento que no usamos

  try {
    const room = await loadRoomById(roomId);
    if (room?.participants.some((p) => p.id === participantId)) {
      const reason = event.resource.status_details?.reason ?? "denegado";
      const domainEvent: RoomEvent =
        mapped === "CAPTURE_FAILED" ? { type: mapped, participantId, reason } : { type: mapped, participantId };
      await applyEvent(room, domainEvent, "paypal");
    }
  } catch (e) {
    // Transición ya aplicada (llegó antes por `authorize`) o estado que no corresponde: no es un error de PayPal.
    if (!(e instanceof TransitionError)) {
      console.error("webhook apply", e);
      await db().from("webhook_events").delete().eq("id", event.id); // permite que el reintento lo reprocese
      return Response.json({ error: "processing_failed" }, { status: 500 });
    }
  }
  return markDone(event.id);
}

async function markDone(id: string) {
  await db().from("webhook_events").update({ processed_at: new Date().toISOString() }).eq("id", id);
  return Response.json({ ok: true });
}
