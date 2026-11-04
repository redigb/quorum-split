/**
 * MOTOR DE CÁLCULO (determinista). La IA nunca calcula montos: solo propone quién consumió qué.
 * Este módulo convierte esas asignaciones en cuánto paga cada persona, al centavo.
 *
 * Ley de conservación: sum(shares) === itemsSubtotal + cargos === printedTotal (si existe).
 * Si no cuadra, se lanza SplitError y NO se crea ninguna orden en PayPal.
 */
import { allocate, sum, type Cents } from "./money";
import type { Bill, Participant, ParticipantId, Share, ShareLine, SplitResult } from "./types";

export type SplitErrorCode =
  | "NO_PARTICIPANTS"
  | "UNKNOWN_PARTICIPANT"
  | "UNASSIGNED_ITEM"
  | "INVALID_WEIGHT"
  | "TOTAL_MISMATCH"
  | "NEGATIVE_SHARE"
  | "INVARIANT_BROKEN";

export class SplitError extends Error {
  constructor(
    public readonly code: SplitErrorCode,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "SplitError";
  }
}

export function computeSplit(bill: Bill, participants: readonly Participant[]): SplitResult {
  if (participants.length === 0) throw new SplitError("NO_PARTICIPANTS", "La sala no tiene participantes");

  // Orden estable por id: garantiza que el reparto de centavos sobrantes sea reproducible.
  const ordered = [...participants].sort((a, b) => a.id.localeCompare(b.id));
  const index = new Map<ParticipantId, number>(ordered.map((p, i) => [p.id, i]));

  const itemsCents: Cents[] = ordered.map(() => 0);
  const lines: ShareLine[][] = ordered.map(() => []);

  // 1) Ítems: cada ítem se reparte entre sus asignados según sus pesos.
  for (const item of bill.items) {
    if (item.assignees.length === 0) {
      throw new SplitError("UNASSIGNED_ITEM", `El ítem "${item.name}" no tiene a nadie asignado`, { itemId: item.id });
    }
    for (const a of item.assignees) {
      if (!index.has(a.participantId)) {
        throw new SplitError("UNKNOWN_PARTICIPANT", `Participante desconocido en "${item.name}"`, {
          itemId: item.id,
          participantId: a.participantId,
        });
      }
      if (!Number.isSafeInteger(a.weight) || a.weight <= 0) {
        throw new SplitError("INVALID_WEIGHT", `Peso inválido en "${item.name}"`, { itemId: item.id });
      }
    }
    const assignees = [...item.assignees].sort(
      (a, b) => index.get(a.participantId)! - index.get(b.participantId)!,
    );
    const parts = allocate(item.lineTotalCents, assignees.map((a) => a.weight));
    assignees.forEach((a, k) => {
      const i = index.get(a.participantId)!;
      itemsCents[i] += parts[k];
      lines[i].push({ itemId: item.id, label: item.name, amountCents: parts[k] });
    });
  }

  // 2) Cargos globales: proporcional al consumo de cada uno, o partes iguales.
  const chargesCents: Cents[] = ordered.map(() => 0);
  // Solo participan del reparto proporcional quienes consumieron algo (consumo > 0).
  const proportionalWeights = itemsCents.map((c) => Math.max(c, 0));
  for (const charge of bill.charges) {
    const weights = charge.split === "equal" ? ordered.map(() => 1) : proportionalWeights;
    const parts = allocate(charge.amountCents, weights);
    parts.forEach((amount, i) => {
      if (amount === 0) return;
      chargesCents[i] += amount;
      lines[i].push({ itemId: null, label: charge.label, amountCents: amount });
    });
  }

  const shares: Share[] = ordered.map((p, i) => ({
    participantId: p.id,
    itemsCents: itemsCents[i],
    chargesCents: chargesCents[i],
    totalCents: itemsCents[i] + chargesCents[i],
    lines: lines[i],
  }));

  const itemsSubtotalCents = sum(bill.items.map((it) => it.lineTotalCents));
  const chargesTotalCents = sum(bill.charges.map((c) => c.amountCents));
  const grandTotalCents = itemsSubtotalCents + chargesTotalCents;

  // 3) Verificaciones duras.
  const negative = shares.find((s) => s.totalCents < 0);
  if (negative) {
    throw new SplitError("NEGATIVE_SHARE", "Un participante quedaría con saldo negativo", {
      participantId: negative.participantId,
      totalCents: negative.totalCents,
    });
  }
  if (sum(shares.map((s) => s.totalCents)) !== grandTotalCents) {
    // No debería pasar nunca: si pasa, es un bug del motor y se bloquea todo.
    throw new SplitError("INVARIANT_BROKEN", "La suma de las partes no coincide con el total");
  }
  if (bill.printedTotalCents !== undefined && bill.printedTotalCents !== grandTotalCents) {
    throw new SplitError("TOTAL_MISMATCH", "El total calculado no coincide con el total del ticket", {
      printedTotalCents: bill.printedTotalCents,
      computedTotalCents: grandTotalCents,
      differenceCents: bill.printedTotalCents - grandTotalCents,
    });
  }

  return { currency: bill.currency, shares, itemsSubtotalCents, chargesTotalCents, grandTotalCents };
}

/**
 * Participantes cuyo total cambió entre dos cálculos. Quien ya había autorizado
 * y aparece aquí debe re-autorizar (su retención en PayPal es por el monto viejo).
 */
export function changedParticipants(before: SplitResult, after: SplitResult): ParticipantId[] {
  const prev = new Map(before.shares.map((s) => [s.participantId, s.totalCents]));
  const ids = new Set([...prev.keys(), ...after.shares.map((s) => s.participantId)]);
  const now = new Map(after.shares.map((s) => [s.participantId, s.totalCents]));
  return [...ids].filter((id) => (prev.get(id) ?? 0) !== (now.get(id) ?? 0));
}

/** Calcula una propina porcentual sobre el subtotal de ítems. bps: 1500 = 15%. */
export function tipFromPercent(itemsSubtotalCents: Cents, basisPoints: number): Cents {
  return Math.round((itemsSubtotalCents * basisPoints) / 10_000);
}
