/**
 * Contratos de salida de la IA. TODO lo que devuelve el LLM pasa por aquí antes de tocar
 * el núcleo. Si no valida, se descarta. La IA propone; el código decide.
 */
import { z } from "zod";
import { isSupportedCurrency, sum, toCents, type Cents, type Currency } from "@/core/money";
import type { BillItem, ExtraCharge, ItemId, ParticipantId } from "@/core/types";

const amount = z.union([z.string(), z.number()]);

/* ---------- 1. Lectura del ticket (foto) ---------- */

export const ReceiptExtractionSchema = z.object({
  merchant: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        quantity: z.number().positive().default(1),
        line_total: amount,
      }),
    )
    .min(1),
  tax: amount.nullable().optional(),
  tip: amount.nullable().optional(),
  service_charge: amount.nullable().optional(),
  delivery_fee: amount.nullable().optional(),
  discount: amount.nullable().optional(),
  total: amount.nullable().optional(),
});
export type ReceiptExtraction = z.infer<typeof ReceiptExtractionSchema>;

export interface BillDraft {
  merchant: string | null;
  currency: Currency;
  items: BillItem[]; // sin asignar todavía
  charges: ExtraCharge[];
  printedTotalCents?: Cents;
  /** Diferencia entre el total impreso y lo que suman ítems + cargos. 0 = el ticket cuadra. */
  differenceCents: Cents;
  warnings: string[];
}

/** Convierte la lectura de la IA en un borrador de cuenta. Los montos pasan a centavos AQUÍ, no en el LLM. */
export function receiptToDraft(raw: unknown, fallbackCurrency: Currency, newId: () => string): BillDraft {
  const r = ReceiptExtractionSchema.parse(raw);
  const warnings: string[] = [];

  let currency: Currency = fallbackCurrency;
  if (r.currency) {
    const c = r.currency.toUpperCase();
    if (isSupportedCurrency(c)) currency = c;
    else warnings.push(`Moneda "${r.currency}" no soportada por PayPal; se usa ${fallbackCurrency}`);
  }

  const items: BillItem[] = r.items.map((it) => ({
    id: newId(),
    name: it.name.trim(),
    quantity: it.quantity,
    lineTotalCents: toCents(it.line_total),
    assignees: [],
  }));

  const charges: ExtraCharge[] = [];
  const addCharge = (value: unknown, kind: ExtraCharge["kind"], label: string, negate = false) => {
    if (value === null || value === undefined || value === "") return;
    const cents = toCents(value as string | number);
    if (cents === 0) return;
    charges.push({ kind, label, amountCents: negate ? -Math.abs(cents) : cents, split: "proportional" });
  };
  addCharge(r.tax, "tax", "Impuesto");
  addCharge(r.service_charge, "service", "Servicio");
  addCharge(r.tip, "tip", "Propina");
  addCharge(r.delivery_fee, "delivery", "Delivery");
  addCharge(r.discount, "other", "Descuento", true);

  const computed = sum(items.map((i) => i.lineTotalCents)) + sum(charges.map((c) => c.amountCents));
  const printedTotalCents = r.total != null && r.total !== "" ? toCents(r.total) : undefined;
  const differenceCents = printedTotalCents === undefined ? 0 : printedTotalCents - computed;
  if (printedTotalCents === undefined) warnings.push("No se encontró el total en el ticket; revisa los montos");
  if (differenceCents !== 0) warnings.push("La suma de los ítems no coincide con el total del ticket");

  return { merchant: r.merchant ?? null, currency, items, charges, printedTotalCents, differenceCents, warnings };
}

/* ---------- 2. Asignación por voz/texto ("la parrilla es de Juan, lo demás a medias") ---------- */

export const AssignmentProposalSchema = z.object({
  assignments: z.array(
    z.object({
      item_id: z.string(),
      participant_ids: z.array(z.string()).min(1),
    }),
  ),
  unresolved: z.array(z.string()).default([]), // frases que la IA no supo interpretar
});
export type AssignmentProposal = z.infer<typeof AssignmentProposalSchema>;

/**
 * Aplica la propuesta SOLO con ids que existen. Lo demás se ignora y se reporta.
 * El resultado es una propuesta que el anfitrión confirma en pantalla.
 */
export function applyAssignmentProposal(
  raw: unknown,
  items: readonly BillItem[],
  participantIds: readonly ParticipantId[],
): { items: BillItem[]; ignored: string[] } {
  const proposal = AssignmentProposalSchema.parse(raw);
  const ignored: string[] = [...proposal.unresolved];
  const byItem = new Map<ItemId, ParticipantId[]>();

  for (const a of proposal.assignments) {
    if (!items.some((i) => i.id === a.item_id)) {
      ignored.push(`ítem desconocido ${a.item_id}`);
      continue;
    }
    const valid = [...new Set(a.participant_ids)].filter((p) => participantIds.includes(p));
    if (valid.length === 0) {
      ignored.push(`sin participantes válidos para ${a.item_id}`);
      continue;
    }
    byItem.set(a.item_id, valid);
  }

  return {
    items: items.map((item) => {
      const pids = byItem.get(item.id);
      return pids ? { ...item, assignees: pids.map((participantId) => ({ participantId, weight: 1 })) } : item;
    }),
    ignored,
  };
}

/* ---------- 3. Intención de reclamo en el chat del participante ---------- */

export const ClaimIntentSchema = z.object({
  intent: z.enum(["PULL", "PUSH", "QUESTION", "UNKNOWN"]),
  item_id: z.string().nullable(),
  /** PULL: de quién tomo el ítem. PUSH: a quién se lo paso. */
  other_participant_id: z.string().nullable(),
  reply: z.string().max(400),
});
export type ClaimIntent = z.infer<typeof ClaimIntentSchema>;

/** Valida que la intención referencie cosas reales; si no, se degrada a UNKNOWN. */
export function sanitizeClaimIntent(
  raw: unknown,
  items: readonly BillItem[],
  participantIds: readonly ParticipantId[],
  self: ParticipantId,
): ClaimIntent {
  const parsed = ClaimIntentSchema.safeParse(raw);
  const unknown: ClaimIntent = {
    intent: "UNKNOWN",
    item_id: null,
    other_participant_id: null,
    reply: "No entendí el cambio. Indica qué ítem y a quién corresponde.",
  };
  if (!parsed.success) return unknown;
  const i = parsed.data;
  if (i.intent === "QUESTION" || i.intent === "UNKNOWN") return i;
  const itemOk = i.item_id !== null && items.some((it) => it.id === i.item_id);
  const otherOk = i.other_participant_id !== null && participantIds.includes(i.other_participant_id) && i.other_participant_id !== self;
  return itemOk && otherOk ? i : unknown;
}
