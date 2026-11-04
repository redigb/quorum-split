/**
 * RECLAMOS CON CONSENSO ("yo no tomé esa cerveza, fue Carlos").
 *
 * La IA NO mueve deuda. La IA solo traduce lo que dice el usuario a una intención
 * (PULL o PUSH); estas reglas deciden si se aplica.
 *
 *  - PULL ("yo invito la cerveza de Juan"): asumo deuda ajena -> se aplica al instante.
 *    Nadie sale perjudicado salvo quien lo pide.
 *  - PUSH ("eso lo pidió Carlos"): intento pasar MI deuda a otro -> queda PENDING_ACK.
 *    Solo si Carlos acepta se mueve. Si rechaza o no responde, decide el anfitrión.
 *  - Anti-troll: máximo MAX_PUSHES empujes por persona. Después, su sala queda en solo lectura.
 */
import type { BillItem, ItemId, ParticipantId } from "./types";

export const MAX_PUSHES_PER_PARTICIPANT = 2;
export const ACK_TIMEOUT_MS = 3 * 60 * 1000;

export type ClaimStatus =
  | "PENDING_ACK" // esperando que el destinatario acepte
  | "ACCEPTED" // el destinatario aceptó: deuda movida
  | "ESCALATED" // rechazado o sin respuesta: decide el anfitrión
  | "RESOLVED"; // el anfitrión decidió

export interface Claim {
  id: string;
  itemId: ItemId;
  fromParticipantId: ParticipantId; // quien tiene el ítem hoy (y lo empuja)
  toParticipantId: ParticipantId; // a quien se lo quiere pasar
  status: ClaimStatus;
  createdAt: number;
  reason?: string;
}

export type HostDecision = "KEEP" | "MOVE" | "SPLIT_ALL";

export class ClaimError extends Error {
  constructor(
    public readonly code:
      | "NOT_ASSIGNED"
      | "SAME_PARTICIPANT"
      | "UNKNOWN_ITEM"
      | "UNKNOWN_PARTICIPANT"
      | "DUPLICATE_CLAIM"
      | "PUSH_LIMIT"
      | "NOT_RECIPIENT"
      | "NOT_HOST"
      | "BAD_STATE",
    message: string,
  ) {
    super(message);
    this.name = "ClaimError";
  }
}

export interface ClaimContext {
  items: readonly BillItem[];
  participantIds: readonly ParticipantId[];
  hostId: ParticipantId;
  claims: readonly Claim[];
}

/** Mueve la porción de `from` en un ítem hacia `to` (si `to` ya tenía porción, se suman). */
export function moveAssignment(items: readonly BillItem[], itemId: ItemId, from: ParticipantId, to: ParticipantId): BillItem[] {
  return items.map((item) => {
    if (item.id !== itemId) return item;
    const fromA = item.assignees.find((a) => a.participantId === from);
    if (!fromA) throw new ClaimError("NOT_ASSIGNED", `${from} no tiene asignado "${item.name}"`);
    const rest = item.assignees.filter((a) => a.participantId !== from);
    const toA = rest.find((a) => a.participantId === to);
    const assignees = toA
      ? rest.map((a) => (a.participantId === to ? { ...a, weight: a.weight + fromA.weight } : a))
      : [...rest, { participantId: to, weight: fromA.weight }];
    return { ...item, assignees };
  });
}

function validate(ctx: ClaimContext, itemId: ItemId, from: ParticipantId, to: ParticipantId) {
  const item = ctx.items.find((i) => i.id === itemId);
  if (!item) throw new ClaimError("UNKNOWN_ITEM", "Ítem inexistente");
  if (!ctx.participantIds.includes(from) || !ctx.participantIds.includes(to)) {
    throw new ClaimError("UNKNOWN_PARTICIPANT", "Participante inexistente");
  }
  if (from === to) throw new ClaimError("SAME_PARTICIPANT", "No puedes reasignarte a ti mismo");
  if (!item.assignees.some((a) => a.participantId === from)) {
    throw new ClaimError("NOT_ASSIGNED", `Ese ítem no está asignado a ${from}`);
  }
}

/** PULL: `taker` asume la porción de `owner`. Se aplica al instante. */
export function pull(ctx: ClaimContext, taker: ParticipantId, itemId: ItemId, owner: ParticipantId): BillItem[] {
  validate(ctx, itemId, owner, taker);
  return moveAssignment(ctx.items, itemId, owner, taker);
}

export function pushCount(claims: readonly Claim[], participantId: ParticipantId): number {
  return claims.filter((c) => c.fromParticipantId === participantId).length;
}

export function isFrozen(claims: readonly Claim[], participantId: ParticipantId): boolean {
  return pushCount(claims, participantId) >= MAX_PUSHES_PER_PARTICIPANT;
}

/** PUSH: `pusher` dice que su porción es de `target`. Crea un reclamo pendiente; NO mueve deuda. */
export function push(
  ctx: ClaimContext,
  pusher: ParticipantId,
  itemId: ItemId,
  target: ParticipantId,
  opts: { id: string; now: number; reason?: string },
): Claim {
  validate(ctx, itemId, pusher, target);
  if (isFrozen(ctx.claims, pusher)) {
    throw new ClaimError("PUSH_LIMIT", "Llegaste al límite de reclamos. El anfitrión decidirá.");
  }
  const duplicate = ctx.claims.some(
    (c) => c.itemId === itemId && c.fromParticipantId === pusher && (c.status === "PENDING_ACK" || c.status === "ESCALATED"),
  );
  if (duplicate) throw new ClaimError("DUPLICATE_CLAIM", "Ya hay un reclamo abierto sobre ese ítem");
  return {
    id: opts.id,
    itemId,
    fromParticipantId: pusher,
    toParticipantId: target,
    status: "PENDING_ACK",
    createdAt: opts.now,
    reason: opts.reason,
  };
}

/** El destinatario responde. Aceptar mueve la deuda; rechazar escala al anfitrión. */
export function respond(
  ctx: ClaimContext,
  claim: Claim,
  responder: ParticipantId,
  accept: boolean,
): { claim: Claim; items: BillItem[] } {
  if (claim.status !== "PENDING_ACK") throw new ClaimError("BAD_STATE", "El reclamo ya no está pendiente");
  if (responder !== claim.toParticipantId) throw new ClaimError("NOT_RECIPIENT", "Solo el destinatario puede responder");
  if (!accept) return { claim: { ...claim, status: "ESCALATED" }, items: [...ctx.items] };
  const items = moveAssignment(ctx.items, claim.itemId, claim.fromParticipantId, claim.toParticipantId);
  return { claim: { ...claim, status: "ACCEPTED" }, items };
}

/** Sin respuesta en ACK_TIMEOUT_MS -> pasa al anfitrión. */
export function expireIfStale(claim: Claim, now: number): Claim {
  if (claim.status === "PENDING_ACK" && now - claim.createdAt >= ACK_TIMEOUT_MS) {
    return { ...claim, status: "ESCALATED" };
  }
  return claim;
}

/**
 * El anfitrión arbitra un reclamo escalado:
 *  KEEP      -> se queda con quien lo tenía
 *  MOVE      -> pasa al destinatario
 *  SPLIT_ALL -> la porción en disputa se reparte entre todos los participantes
 */
export function resolveByHost(
  ctx: ClaimContext,
  claim: Claim,
  actor: ParticipantId,
  decision: HostDecision,
): { claim: Claim; items: BillItem[] } {
  if (actor !== ctx.hostId) throw new ClaimError("NOT_HOST", "Solo el anfitrión puede arbitrar");
  if (claim.status !== "ESCALATED" && claim.status !== "PENDING_ACK") {
    throw new ClaimError("BAD_STATE", "El reclamo ya está cerrado");
  }
  const resolved: Claim = { ...claim, status: "RESOLVED" };
  if (decision === "KEEP") return { claim: resolved, items: [...ctx.items] };
  if (decision === "MOVE") {
    return { claim: resolved, items: moveAssignment(ctx.items, claim.itemId, claim.fromParticipantId, claim.toParticipantId) };
  }
  // SPLIT_ALL: la porción de `from` se convierte en una porción igual para cada participante.
  const items = ctx.items.map((item) => {
    if (item.id !== claim.itemId) return item;
    const fromA = item.assignees.find((a) => a.participantId === claim.fromParticipantId);
    if (!fromA) throw new ClaimError("NOT_ASSIGNED", "La porción en disputa ya no existe");
    const n = ctx.participantIds.length;
    // Escalamos los pesos para que la porción en disputa se divida exacta entre n personas.
    const scaled = item.assignees
      .filter((a) => a.participantId !== claim.fromParticipantId)
      .map((a) => ({ ...a, weight: a.weight * n }));
    for (const pid of ctx.participantIds) {
      const existing = scaled.find((a) => a.participantId === pid);
      if (existing) existing.weight += fromA.weight;
      else scaled.push({ participantId: pid, weight: fromA.weight });
    }
    return { ...item, assignees: scaled };
  });
  return { claim: resolved, items };
}
