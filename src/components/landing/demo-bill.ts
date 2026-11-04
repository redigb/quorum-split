/**
 * Cuenta de ejemplo para la landing. Los montos salen del motor real (computeSplit),
 * no están escritos a mano: la landing demuestra el cálculo justo de verdad.
 */
import { formatMoney, type Cents } from "@/core/money";
import { computeSplit } from "@/core/split";
import type { Bill, Participant } from "@/core/types";

export interface DemoPerson {
  id: string;
  name: string;
  from: string; // país, para el pitch cross-border
  flag: string;
  hue: string; // color del avatar
  /** Cómo vería su parte en su moneda (ilustrativo; PayPal cobra en la moneda de la cuenta). */
  local?: { code: string; rate: number; locale: string };
}

export const PEOPLE: DemoPerson[] = [
  { id: "lu", name: "Lucía", from: "Lima", flag: "🇵🇪", hue: "#3d2fa9", local: { code: "PEN", rate: 3.75, locale: "es-PE" } },
  { id: "ma", name: "Mateo", from: "Madrid", flag: "🇪🇸", hue: "#c2410c", local: { code: "EUR", rate: 0.92, locale: "es-ES" } },
  { id: "sa", name: "Sam", from: "Austin", flag: "🇺🇸", hue: "#0f766e" },
  { id: "ai", name: "Aiko", from: "Osaka", flag: "🇯🇵", hue: "#be185d", local: { code: "JPY", rate: 151, locale: "ja-JP" } },
  { id: "di", name: "Diego", from: "CDMX", flag: "🇲🇽", hue: "#a16207", local: { code: "MXN", rate: 17.2, locale: "es-MX" } },
];

const participants: Participant[] = PEOPLE.map((p, i) => ({ id: p.id, name: p.name, isHost: i === 0 }));

const one = (id: string) => [{ participantId: id, weight: 1 }];

export const BILL: Bill = {
  currency: "USD",
  items: [
    { id: "i1", name: "Grilled octopus", quantity: 1, lineTotalCents: 2400, assignees: one("lu") },
    { id: "i2", name: "Bacalhau à Brás", quantity: 1, lineTotalCents: 1900, assignees: one("ma") },
    { id: "i3", name: "Ribeye 400g", quantity: 1, lineTotalCents: 4800, assignees: one("sa") },
    { id: "i4", name: "Mushroom risotto", quantity: 1, lineTotalCents: 1650, assignees: one("ai") },
    { id: "i5", name: "Smash burger", quantity: 1, lineTotalCents: 1400, assignees: one("di") },
    {
      id: "i6",
      name: "Vinho Verde ×2",
      quantity: 2,
      lineTotalCents: 5200,
      assignees: ["lu", "ma", "sa"].map((id) => ({ participantId: id, weight: 1 })),
    },
    {
      id: "i7",
      name: "Pastéis de nata ×5",
      quantity: 5,
      lineTotalCents: 1250,
      assignees: PEOPLE.map((p) => ({ participantId: p.id, weight: 1 })),
    },
  ],
  charges: [
    { kind: "tax", label: "VAT 13%", amountCents: 2418, split: "proportional" },
    { kind: "tip", label: "Tip", amountCents: 1800, split: "proportional" },
  ],
};

export const SPLIT = computeSplit(BILL, participants);

export const money = (c: Cents) => formatMoney(c, BILL.currency, "en-US");

export function shareOf(id: string): Cents {
  return SPLIT.shares.find((s) => s.participantId === id)?.totalCents ?? 0;
}

/** Lo que pagaría cada uno dividiendo "entre N" (lo injusto). */
export const NAIVE_EACH: Cents = Math.round(SPLIT.grandTotalCents / PEOPLE.length);

/** "≈ €44.10" en la moneda de la persona (solo ilustrativo). Vacío si ya paga en USD. */
export function localLabel(id: string): string {
  const p = PEOPLE.find((x) => x.id === id);
  if (!p?.local) return "";
  const v = (shareOf(id) / 100) * p.local.rate;
  return "≈ " + new Intl.NumberFormat(p.local.locale, { style: "currency", currency: p.local.code, maximumFractionDigits: p.local.code === "JPY" ? 0 : 2 }).format(v);
}
