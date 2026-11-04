import { describe, expect, it } from "vitest";
import { changedParticipants, computeSplit, SplitError, tipFromPercent } from "./split";
import type { Bill, Participant } from "./types";

const people: Participant[] = [
  { id: "ana", name: "Ana", isHost: true },
  { id: "carlos", name: "Carlos", isHost: false },
  { id: "juan", name: "Juan", isHost: false },
];

function dinner(): Bill {
  return {
    currency: "USD",
    items: [
      { id: "steak", name: "Parrilla", quantity: 1, lineTotalCents: 5000, assignees: [{ participantId: "juan", weight: 1 }] },
      { id: "salad", name: "Ensalada", quantity: 1, lineTotalCents: 1000, assignees: [{ participantId: "ana", weight: 1 }] },
      {
        id: "nachos",
        name: "Nachos",
        quantity: 1,
        lineTotalCents: 1500,
        assignees: [
          { participantId: "ana", weight: 1 },
          { participantId: "carlos", weight: 1 },
          { participantId: "juan", weight: 1 },
        ],
      },
      { id: "beer", name: "Cerveza", quantity: 1, lineTotalCents: 800, assignees: [{ participantId: "carlos", weight: 1 }] },
    ],
    charges: [
      { kind: "tax", label: "Impuesto", amountCents: 1500, split: "proportional" },
      { kind: "tip", label: "Propina", amountCents: 1245, split: "proportional" },
    ],
  };
}

const total = (r: ReturnType<typeof computeSplit>, id: string) => r.shares.find((s) => s.participantId === id)!.totalCents;

describe("computeSplit", () => {
  it("la suma de las partes es exactamente el total", () => {
    const r = computeSplit(dinner(), people);
    expect(r.grandTotalCents).toBe(5000 + 1000 + 1500 + 800 + 1500 + 1245);
    expect(r.shares.reduce((a, s) => a + s.totalCents, 0)).toBe(r.grandTotalCents);
  });

  it("coincide con el ejemplo de docs/04-motor-de-calculo.md", () => {
    const r = computeSplit(dinner(), people);
    expect(r.shares.map((s) => [s.participantId, s.itemsCents, s.chargesCents, s.totalCents])).toEqual([
      ["ana", 1500, 496, 1996],
      ["carlos", 1300, 430, 1730],
      ["juan", 5500, 1819, 7319],
    ]);
  });

  it("los ítems se reparten según asignación", () => {
    const r = computeSplit(dinner(), people);
    const items = (id: string) => r.shares.find((s) => s.participantId === id)!.itemsCents;
    expect(items("juan")).toBe(5000 + 500);
    expect(items("ana")).toBe(1000 + 500);
    expect(items("carlos")).toBe(800 + 500);
  });

  it("impuesto y propina proporcionales: quien consume más, paga más", () => {
    const r = computeSplit(dinner(), people);
    const charges = (id: string) => r.shares.find((s) => s.participantId === id)!.chargesCents;
    expect(charges("juan")).toBeGreaterThan(charges("ana"));
    expect(charges("ana")).toBeGreaterThan(charges("carlos"));
  });

  it("cargo en partes iguales", () => {
    const bill = dinner();
    bill.charges = [{ kind: "delivery", label: "Delivery", amountCents: 900, split: "equal" }];
    const r = computeSplit(bill, people);
    expect(r.shares.map((s) => s.chargesCents)).toEqual([300, 300, 300]);
  });

  it("verifica contra el total impreso del ticket", () => {
    const bill = dinner();
    bill.printedTotalCents = 11045;
    expect(() => computeSplit(bill, people)).not.toThrow();
    bill.printedTotalCents = 11046;
    try {
      computeSplit(bill, people);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(SplitError);
      expect((e as SplitError).code).toBe("TOTAL_MISMATCH");
      expect((e as SplitError).details.differenceCents).toBe(1);
    }
  });

  it("bloquea ítems sin asignar", () => {
    const bill = dinner();
    bill.items[0].assignees = [];
    expect(() => computeSplit(bill, people)).toThrowError(/no tiene a nadie asignado/);
  });

  it("bloquea participantes inventados (p. ej. por la IA)", () => {
    const bill = dinner();
    bill.items[0].assignees = [{ participantId: "hacker", weight: 1 }];
    expect(() => computeSplit(bill, people)).toThrowError(SplitError);
  });

  it("bloquea saldos negativos", () => {
    const bill = dinner();
    bill.items.push({ id: "promo", name: "Descuento", quantity: 1, lineTotalCents: -5000, assignees: [{ participantId: "carlos", weight: 1 }] });
    expect(() => computeSplit(bill, people)).toThrowError(/negativo/);
  });

  it("es determinista sin importar el orden de los participantes", () => {
    const a = computeSplit(dinner(), people);
    const b = computeSplit(dinner(), [...people].reverse());
    expect(a.shares).toEqual(b.shares);
  });

  it("detecta quién cambió de monto", () => {
    const before = computeSplit(dinner(), people);
    const bill = dinner();
    bill.items[3].assignees = [{ participantId: "juan", weight: 1 }]; // la cerveza pasa de Carlos a Juan
    const after = computeSplit(bill, people);
    expect(total(after, "carlos")).toBeLessThan(total(before, "carlos"));
    expect(changedParticipants(before, after)).toContain("carlos");
    expect(changedParticipants(before, after)).toContain("juan");
  });
});

describe("tipFromPercent", () => {
  it("15% de 83.00 = 12.45", () => {
    expect(tipFromPercent(8300, 1500)).toBe(1245);
  });
});
