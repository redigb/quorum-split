import "server-only";
import { reduceRoom, type PaymentStatus, type RoomEffect, type RoomEvent, type RoomState, type RoomStatus } from "@/core/room-machine";
import { captureAuthorization, voidAuthorization } from "./paypal/client";
import { db } from "./db/client";
import { logEvent, type LoadedRoom } from "./db/rooms";

export async function stateOf(room: LoadedRoom): Promise<RoomState> {
  const { count, error } = await db()
    .from("claims")
    .select("id", { count: "exact", head: true })
    .eq("room_id", room.id)
    .in("status", ["PENDING_ACK", "ESCALATED"]);
  if (error) throw new Error(error.message);
  return {
    status: room.status as RoomStatus,
    payments: Object.fromEntries(room.participants.map((p) => [p.id, p.paymentStatus as PaymentStatus])),
    openClaims: count ?? 0,
  };
}

/** Guarda el estado nuevo. El `.eq("status", antes)` evita que dos eventos simultáneos se pisen. */
async function persist(room: LoadedRoom, before: RoomState, after: RoomState) {
  if (after.status !== before.status) {
    const { data, error } = await db()
      .from("rooms")
      .update({ status: after.status, updated_at: new Date().toISOString() })
      .eq("id", room.id)
      .eq("status", before.status)
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("La sala cambió mientras se procesaba; reintenta");
  }
  for (const [id, status] of Object.entries(after.payments)) {
    if (before.payments[id] !== status) {
      const { error } = await db().from("participants").update({ payment_status: status }).eq("id", id);
      if (error) throw new Error(error.message);
    }
  }
}

/** A quién se refiere el evento (para que el libro mayor pueda mostrar nombre y monto). */
const who = (event: RoomEvent) => ("participantId" in event ? { participantId: event.participantId } : {});

/** Aplica un evento: máquina pura -> guardar -> ledger -> efectos en PayPal. */
export async function applyEvent(room: LoadedRoom, event: RoomEvent, actor: string): Promise<RoomState> {
  const before = await stateOf(room);
  const { state, effects } = reduceRoom(before, event);
  await persist(room, before, state);
  await logEvent(room.id, event.type, actor, { from: before.status, to: state.status, ...who(event) });
  for (const effect of effects) await runEffect(room, state, effect);
  return (await readState(room)) ?? state;
}

async function readState(room: LoadedRoom): Promise<RoomState | null> {
  const { data } = await db().from("rooms").select("status").eq("id", room.id).single();
  const { data: parts } = await db().from("participants").select("id, payment_status").eq("room_id", room.id);
  if (!data || !parts) return null;
  return {
    status: data.status as RoomStatus,
    payments: Object.fromEntries(parts.map((p) => [p.id, p.payment_status as PaymentStatus])),
    openClaims: 0,
  };
}

async function authorizationOf(roomId: string, participantId: string): Promise<string | null> {
  const { data } = await db()
    .from("paypal_payments")
    .select("authorization_id")
    .eq("room_id", roomId)
    .eq("participant_id", participantId)
    .eq("status", "AUTHORIZED")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.authorization_id ?? null;
}

async function runEffect(room: LoadedRoom, state: RoomState, effect: RoomEffect) {
  switch (effect.type) {
    case "VOID_AUTHORIZATION": {
      const authId = await authorizationOf(room.id, effect.participantId);
      if (!authId) return;
      await voidAuthorization(authId);
      await db().from("paypal_payments").update({ status: "VOIDED", updated_at: new Date().toISOString() }).eq("authorization_id", authId);
      await logEvent(room.id, "AUTHORIZATION_VOIDED_PAYPAL", "paypal", { participantId: effect.participantId });
      return;
    }
    case "CAPTURE_ALL":
      await captureAll(room);
      return;
    case "NOTIFY_HOST":
    case "NOTIFY_PARTICIPANT":
      await logEvent(room.id, "NOTIFICATION", "system", effect);
      return;
    case "PAYOUT_BENEFICIARY":
      // Demo: el dinero queda en la cuenta business de la plataforma (ver docs/06-paypal.md).
      await logEvent(room.id, "PAYOUT_PENDING", "system", { note: "pago al beneficiario no automatizado en la demo" });
      return;
  }
}

/** FUNDED -> CAPTURING -> cobra a cada pagador. Cada captura usa clave de idempotencia (ver client.ts). */
async function captureAll(room: LoadedRoom) {
  let current = (await readState(room))!;
  current = (await step(room, current, { type: "CAPTURE_STARTED" }))!;

  for (const [participantId, status] of Object.entries(current.payments)) {
    if (status !== "AUTHORIZED") continue;
    // Amigo simulado del modo demo: no hay dinero real que cobrar, se da por cobrado.
    if (room.participants.find((p) => p.id === participantId)?.simConfirmAt) {
      current = (await step(room, current, { type: "CAPTURED", participantId }))!;
      continue;
    }
    const authId = await authorizationOf(room.id, participantId);
    try {
      if (!authId) throw new Error("sin autorización guardada");
      const cap = await captureAuthorization(authId);
      await db()
        .from("paypal_payments")
        .update({ status: "CAPTURED", capture_id: cap.id, updated_at: new Date().toISOString() })
        .eq("authorization_id", authId);
      current = (await step(room, current, { type: "CAPTURED", participantId }))!;
    } catch (e) {
      current = (await step(room, current, {
        type: "CAPTURE_FAILED",
        participantId,
        reason: e instanceof Error ? e.message : "error",
      }))!;
      return; // la sala queda FAILED: requiere acción del anfitrión
    }
  }
}

/** Un paso de la máquina SIN reentrar en captureAll (evita recursión). */
async function step(room: LoadedRoom, before: RoomState, event: RoomEvent): Promise<RoomState> {
  const { state, effects } = reduceRoom(before, event);
  await persist(room, before, state);
  await logEvent(room.id, event.type, "system", { from: before.status, to: state.status, ...who(event) });
  for (const effect of effects) if (effect.type !== "CAPTURE_ALL") await runEffect(room, state, effect);
  return state;
}
