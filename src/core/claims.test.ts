import { describe, expect, it } from "vitest";
import {
  ACK_TIMEOUT_MS,
  ClaimError,
  expireIfStale,
  pull,
  push,
  resolveByHost,
  respond,
  type Claim,
  type ClaimContext,
} from "./claims";
import { computeSplit } from "./split";
import type { BillItem } from "./types";

const items: BillItem[] = [
  { id: "beer", name: "Cerveza", quantity: 1, lineTotalCents: 900, assignees: [{ participantId: "juan", weight: 1 }] },
  { id: "pizza", name: "Pizza", quantity: 1, lineTotalCents: 3000, assignees: [{ participantId: "carlos", weight: 1 }, { participantId: "juan", weight: 1 }] },
];

function ctx(claims: Claim[] = [], its = items): ClaimContext {
  return { items: its, participantIds: ["ana", "carlos", "juan"], hostId: "ana", claims };
}

const owners = (its: BillItem[], id: string) => its.find((i) => i.id === id)!.assignees;

describe("PULL: asumir deuda ajena se aplica al instante", () => {
  it("Carlos invita la cerveza de Juan", () => {
    const next = pull(ctx(), "carlos", "beer", "juan");
    expect(owners(next, "beer")).toEqual([{ participantId: "carlos", weight: 1 }]);
  });

  it("si ya tenía porción, se suman los pesos", () => {
    const next = pull(ctx(), "carlos", "pizza", "juan");
    expect(owners(next, "pizza")).toEqual([{ participantId: "carlos", weight: 2 }]);
  });
});

describe("PUSH: pasar mi deuda a otro requiere su aceptación", () => {
  it("crea un reclamo pendiente sin mover nada", () => {
    const claim = push(ctx(), "juan", "beer", "carlos", { id: "c1", now: 0 });
    expect(claim.status).toBe("PENDING_ACK");
  });

  it("si Carlos acepta, la deuda se mueve", () => {
    const claim = push(ctx(), "juan", "beer", "carlos", { id: "c1", now: 0 });
    const r = respond(ctx([claim]), claim, "carlos", true);
    expect(r.claim.status).toBe("ACCEPTED");
    expect(owners(r.items, "beer")).toEqual([{ participantId: "carlos", weight: 1 }]);
  });

  it("si Carlos rechaza, escala al anfitrión y nada se mueve", () => {
    const claim = push(ctx(), "juan", "beer", "carlos", { id: "c1", now: 0 });
    const r = respond(ctx([claim]), claim, "carlos", false);
    expect(r.claim.status).toBe("ESCALATED");
    expect(owners(r.items, "beer")).toEqual([{ participantId: "juan", weight: 1 }]);
  });

  it("solo el destinatario puede responder (Juan no puede auto-aceptar)", () => {
    const claim = push(ctx(), "juan", "beer", "carlos", { id: "c1", now: 0 });
    expect(() => respond(ctx([claim]), claim, "juan", true)).toThrow(ClaimError);
  });

  it("no puedes empujar algo que no es tuyo", () => {
    expect(() => push(ctx(), "ana", "beer", "carlos", { id: "c1", now: 0 })).toThrow(/no está asignado/);
  });

  it("sin respuesta en 3 minutos, escala al anfitrión", () => {
    const claim = push(ctx(), "juan", "beer", "carlos", { id: "c1", now: 0 });
    expect(expireIfStale(claim, ACK_TIMEOUT_MS - 1).status).toBe("PENDING_ACK");
    expect(expireIfStale(claim, ACK_TIMEOUT_MS).status).toBe("ESCALATED");
  });
});

describe("anti-troll y papa caliente", () => {
  it("máximo 2 reclamos PUSH por persona", () => {
    const c1 = { ...push(ctx(), "juan", "beer", "carlos", { id: "c1", now: 0 }), status: "RESOLVED" as const };
    const c2 = { ...push(ctx([c1]), "juan", "pizza", "ana", { id: "c2", now: 0 }), status: "RESOLVED" as const };
    expect(() => push(ctx([c1, c2]), "juan", "beer", "ana", { id: "c3", now: 0 })).toThrow(/límite/);
  });

  it("no se duplican reclamos abiertos sobre el mismo ítem", () => {
    const c1 = push(ctx(), "juan", "beer", "carlos", { id: "c1", now: 0 });
    expect(() => push(ctx([c1]), "juan", "beer", "ana", { id: "c2", now: 0 })).toThrow(/Ya hay un reclamo/);
  });
});

describe("arbitraje del anfitrión", () => {
  const escalated: Claim = { id: "c1", itemId: "beer", fromParticipantId: "juan", toParticipantId: "carlos", status: "ESCALATED", createdAt: 0 };

  it("solo el anfitrión decide", () => {
    expect(() => resolveByHost(ctx([escalated]), escalated, "carlos", "MOVE")).toThrow(/anfitrión/);
  });

  it("KEEP deja todo igual", () => {
    const r = resolveByHost(ctx([escalated]), escalated, "ana", "KEEP");
    expect(owners(r.items, "beer")).toEqual([{ participantId: "juan", weight: 1 }]);
    expect(r.claim.status).toBe("RESOLVED");
  });

  it("SPLIT_ALL reparte la porción en disputa entre todos, sin perder centavos", () => {
    const r = resolveByHost(ctx([escalated]), escalated, "ana", "SPLIT_ALL");
    const split = computeSplit(
      { currency: "USD", items: r.items, charges: [] },
      [
        { id: "ana", name: "Ana", isHost: true },
        { id: "carlos", name: "Carlos", isHost: false },
        { id: "juan", name: "Juan", isHost: false },
      ],
    );
    expect(split.grandTotalCents).toBe(3900);
    const beerLines = split.shares.flatMap((s) => s.lines.filter((l) => l.itemId === "beer").map((l) => l.amountCents));
    expect(beerLines).toEqual([300, 300, 300]);
  });

  it("SPLIT_ALL sobre un ítem compartido conserva la porción del otro dueño", () => {
    const pizzaClaim: Claim = { ...escalated, itemId: "pizza" };
    const r = resolveByHost(ctx([pizzaClaim]), pizzaClaim, "ana", "SPLIT_ALL");
    const split = computeSplit({ currency: "USD", items: r.items, charges: [] }, [
      { id: "ana", name: "Ana", isHost: true },
      { id: "carlos", name: "Carlos", isHost: false },
      { id: "juan", name: "Juan", isHost: false },
    ]);
    const pizza = Object.fromEntries(
      split.shares.map((s) => [s.participantId, s.lines.find((l) => l.itemId === "pizza")?.amountCents ?? 0]),
    );
    // Carlos tenía 1500; la mitad de Juan (1500) se reparte entre 3 -> 500 c/u
    expect(pizza).toEqual({ ana: 500, carlos: 2000, juan: 500 });
  });
});
