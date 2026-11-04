/**
 * MÁQUINA DE ESTADOS DE LA SALA (pura, sin I/O).
 *
 * reduceRoom(estado, evento) -> { estado nuevo, efectos }
 * Los "efectos" son órdenes para el servidor (anular autorización, cobrar a todos...).
 * Así toda la lógica de negocio se puede testear sin tocar PayPal ni la base de datos.
 *
 * Regla de oro: "Nadie paga hasta que todos pagan".
 * Cada persona AUTORIZA su parte (PayPal retiene el dinero, no lo cobra). Solo cuando el
 * 100% autorizó y no hay reclamos abiertos, se CAPTURA (cobra) a todos a la vez.
 */
import type { ParticipantId } from "./types";

export type RoomStatus =
  | "DRAFT" // el anfitrión está revisando ítems y asignaciones
  | "OPEN" // enlaces activos, juntando autorizaciones
  | "FUNDED" // 100% autorizado, se dispara el cobro
  | "CAPTURING" // cobrando a todos
  | "SETTLED" // todo cobrado (estado final feliz)
  | "EXPIRED" // venció el plazo sin llegar al 100%: se anula todo, nadie paga
  | "CANCELLED" // el anfitrión canceló: se anula todo
  | "FAILED"; // algún cobro falló: requiere acción del anfitrión

export type PaymentStatus =
  | "UNPAID"
  | "ORDER_CREATED" // abrió el botón de PayPal
  | "AUTHORIZED" // dinero retenido
  | "CAPTURED" // dinero cobrado
  | "VOIDED" // retención anulada
  | "FAILED"
  | "EXEMPT"; // no debe nada (parte = 0 o el anfitrión que ya pagó el total)

export interface RoomState {
  status: RoomStatus;
  payments: Record<ParticipantId, PaymentStatus>;
  openClaims: number;
}

export type RoomEvent =
  | { type: "LOCK_SHARES"; payers: ParticipantId[]; exempt: ParticipantId[] }
  | { type: "ORDER_CREATED"; participantId: ParticipantId }
  | { type: "AUTHORIZED"; participantId: ParticipantId }
  | { type: "AUTHORIZATION_VOIDED"; participantId: ParticipantId }
  | { type: "CLAIM_OPENED" }
  | { type: "CLAIM_CLOSED"; changedParticipants: ParticipantId[] }
  | { type: "CAPTURE_STARTED" }
  | { type: "CAPTURED"; participantId: ParticipantId }
  | { type: "CAPTURE_FAILED"; participantId: ParticipantId; reason: string }
  | { type: "DEADLINE_REACHED" }
  | { type: "HOST_CANCELLED" };

export type RoomEffect =
  | { type: "VOID_AUTHORIZATION"; participantId: ParticipantId }
  | { type: "CAPTURE_ALL" }
  | { type: "PAYOUT_BENEFICIARY" }
  | { type: "NOTIFY_HOST"; reason: string }
  | { type: "NOTIFY_PARTICIPANT"; participantId: ParticipantId; reason: string };

export class TransitionError extends Error {
  constructor(status: RoomStatus, event: RoomEvent["type"], why = "") {
    super(`Transición inválida: ${event} en estado ${status}${why ? ` (${why})` : ""}`);
    this.name = "TransitionError";
  }
}

export const TERMINAL: readonly RoomStatus[] = ["SETTLED", "EXPIRED", "CANCELLED"];

export function initialRoom(): RoomState {
  return { status: "DRAFT", payments: {}, openClaims: 0 };
}

export function reduceRoom(state: RoomState, event: RoomEvent): { state: RoomState; effects: RoomEffect[] } {
  const fail = (why = "") => {
    throw new TransitionError(state.status, event.type, why);
  };
  const effects: RoomEffect[] = [];
  const payments = { ...state.payments };
  const next = (patch: Partial<RoomState>) => ({ state: { ...state, payments, ...patch }, effects });
  const requirePayer = (id: ParticipantId) => {
    if (!(id in payments)) fail(`participante ${id} no existe`);
    if (payments[id] === "EXEMPT") fail(`participante ${id} no debe nada`);
  };

  switch (event.type) {
    case "LOCK_SHARES": {
      if (state.status !== "DRAFT") fail();
      if (event.payers.length === 0) fail("no hay nadie que pague");
      for (const id of event.payers) payments[id] = "UNPAID";
      for (const id of event.exempt) payments[id] = "EXEMPT";
      return next({ status: "OPEN" });
    }

    case "ORDER_CREATED": {
      if (state.status !== "OPEN") fail();
      requirePayer(event.participantId);
      if (!["UNPAID", "VOIDED", "ORDER_CREATED"].includes(payments[event.participantId])) fail("ya autorizó");
      payments[event.participantId] = "ORDER_CREATED";
      return next({});
    }

    case "AUTHORIZED": {
      // Carrera: alguien aprobó en PayPal justo después de vencer/cancelar. No se cobra: se anula.
      if (state.status === "EXPIRED" || state.status === "CANCELLED") {
        requirePayer(event.participantId);
        payments[event.participantId] = "VOIDED";
        effects.push({ type: "VOID_AUTHORIZATION", participantId: event.participantId });
        return next({});
      }
      if (state.status !== "OPEN") fail();
      requirePayer(event.participantId);
      if (payments[event.participantId] === "AUTHORIZED") return next({}); // idempotente (webhook repetido)
      payments[event.participantId] = "AUTHORIZED";
      return maybeFund({ ...state, payments }, effects);
    }

    case "AUTHORIZATION_VOIDED": {
      if (!["OPEN", "FUNDED", "EXPIRED", "CANCELLED"].includes(state.status)) fail();
      requirePayer(event.participantId);
      if (payments[event.participantId] === "CAPTURED") fail("ya fue cobrado");
      payments[event.participantId] = "VOIDED";
      // Si estaba FUNDED (aún no se empezó a cobrar), vuelve a OPEN.
      return next({ status: state.status === "FUNDED" ? "OPEN" : state.status });
    }

    case "CLAIM_OPENED": {
      if (state.status !== "OPEN") fail("solo se reclama mientras la sala está abierta");
      return next({ openClaims: state.openClaims + 1 });
    }

    case "CLAIM_CLOSED": {
      if (state.status !== "OPEN" || state.openClaims === 0) fail();
      // Quien ya había autorizado y le cambió el monto debe re-autorizar el nuevo monto.
      for (const id of event.changedParticipants) {
        if (payments[id] === "AUTHORIZED") {
          payments[id] = "VOIDED"; // se marca ya: la sala no puede financiarse con un monto viejo
          effects.push({ type: "VOID_AUTHORIZATION", participantId: id });
          effects.push({ type: "NOTIFY_PARTICIPANT", participantId: id, reason: "Tu monto cambió, vuelve a confirmar" });
        }
      }
      return maybeFund({ ...state, payments, openClaims: state.openClaims - 1 }, effects);
    }

    case "CAPTURE_STARTED": {
      if (state.status !== "FUNDED") fail();
      return next({ status: "CAPTURING" });
    }

    case "CAPTURED": {
      if (!["CAPTURING", "FAILED"].includes(state.status)) fail();
      requirePayer(event.participantId);
      payments[event.participantId] = "CAPTURED";
      const allCaptured = Object.values(payments).every((p) => p === "CAPTURED" || p === "EXEMPT");
      if (allCaptured) {
        effects.push({ type: "PAYOUT_BENEFICIARY" });
        return next({ status: "SETTLED" });
      }
      return next({});
    }

    case "CAPTURE_FAILED": {
      if (state.status !== "CAPTURING") fail();
      requirePayer(event.participantId);
      payments[event.participantId] = "FAILED";
      effects.push({ type: "NOTIFY_HOST", reason: `No se pudo cobrar a ${event.participantId}: ${event.reason}` });
      return next({ status: "FAILED" });
    }

    case "DEADLINE_REACHED": {
      if (state.status !== "OPEN") return next({}); // si ya se financió, el plazo no importa
      voidAll(payments, effects);
      return next({ status: "EXPIRED" });
    }

    case "HOST_CANCELLED": {
      if (!["DRAFT", "OPEN", "FUNDED"].includes(state.status)) fail("ya se empezó a cobrar");
      voidAll(payments, effects);
      return next({ status: "CANCELLED" });
    }
  }
}

function maybeFund(state: RoomState, effects: RoomEffect[]) {
  const allAuthorized = Object.values(state.payments).every((p) => p === "AUTHORIZED" || p === "EXEMPT");
  const hasPayers = Object.values(state.payments).some((p) => p === "AUTHORIZED");
  if (allAuthorized && hasPayers && state.openClaims === 0) {
    effects.push({ type: "CAPTURE_ALL" });
    return { state: { ...state, status: "FUNDED" as const }, effects };
  }
  return { state, effects };
}

function voidAll(payments: Record<ParticipantId, PaymentStatus>, effects: RoomEffect[]) {
  for (const [id, status] of Object.entries(payments)) {
    if (status === "AUTHORIZED") {
      payments[id] = "VOIDED";
      effects.push({ type: "VOID_AUTHORIZATION", participantId: id });
    }
  }
}

/** Progreso para la barra de la sala: cuántos de los que deben pagar ya autorizaron/pagaron. */
export function progress(state: RoomState): { done: number; total: number } {
  const payers = Object.values(state.payments).filter((p) => p !== "EXEMPT");
  const done = payers.filter((p) => p === "AUTHORIZED" || p === "CAPTURED").length;
  return { done, total: payers.length };
}
