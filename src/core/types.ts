import type { Cents, Currency } from "./money";

export type ParticipantId = string;
export type ItemId = string;

export interface Participant {
  id: ParticipantId;
  name: string;
  /** El anfitrión crea la sala y arbitra reclamos. También puede deber su parte. */
  isHost: boolean;
}

/** Cuántas "porciones" de un ítem le tocan a alguien. 1 y 1 = mitad y mitad; 2 y 1 = 2/3 y 1/3. */
export interface Assignment {
  participantId: ParticipantId;
  weight: number;
}

export interface BillItem {
  id: ItemId;
  name: string;
  quantity: number;
  /** Total de la línea (cantidad * precio). Negativo = descuento. */
  lineTotalCents: Cents;
  assignees: Assignment[];
}

/** Cómo se reparten los cargos globales (impuesto, propina, delivery) entre las personas. */
export type ChargeSplitMode = "proportional" | "equal";

export interface ExtraCharge {
  kind: "tax" | "tip" | "service" | "delivery" | "other";
  label: string;
  amountCents: Cents;
  split: ChargeSplitMode;
}

export interface Bill {
  currency: Currency;
  items: BillItem[];
  charges: ExtraCharge[];
  /**
   * Total impreso en el ticket. Si existe, el cálculo DEBE cuadrar al centavo con él:
   * es nuestra verificación contra errores de lectura de la IA.
   */
  printedTotalCents?: Cents;
}

export interface ShareLine {
  itemId: ItemId | null; // null = cargo global
  label: string;
  amountCents: Cents;
}

export interface Share {
  participantId: ParticipantId;
  itemsCents: Cents;
  chargesCents: Cents;
  totalCents: Cents;
  lines: ShareLine[];
}

export interface SplitResult {
  currency: Currency;
  shares: Share[];
  itemsSubtotalCents: Cents;
  chargesTotalCents: Cents;
  grandTotalCents: Cents;
}
