import { describe, expect, it } from "vitest";
import { initialRoom, progress, reduceRoom, TransitionError, type RoomEvent, type RoomState } from "./room-machine";

function run(events: RoomEvent[], start: RoomState = initialRoom()) {
  let state = start;
  const effects = [];
  for (const e of events) {
    const r = reduceRoom(state, e);
    state = r.state;
    effects.push(...r.effects);
  }
  return { state, effects };
}

const lock: RoomEvent = { type: "LOCK_SHARES", payers: ["carlos", "juan"], exempt: ["ana"] };

describe("sala: camino feliz", () => {
  it("nadie paga hasta que todos autorizan; luego se cobra a todos", () => {
    const { state, effects } = run([
      lock,
      { type: "ORDER_CREATED", participantId: "carlos" },
      { type: "AUTHORIZED", participantId: "carlos" },
    ]);
    expect(state.status).toBe("OPEN");
    expect(effects).toEqual([]);
    expect(progress(state)).toEqual({ done: 1, total: 2 });

    const funded = run([{ type: "AUTHORIZED", participantId: "juan" }], state);
    expect(funded.state.status).toBe("FUNDED");
    expect(funded.effects).toEqual([{ type: "CAPTURE_ALL" }]);

    const settled = run(
      [
        { type: "CAPTURE_STARTED" },
        { type: "CAPTURED", participantId: "carlos" },
        { type: "CAPTURED", participantId: "juan" },
      ],
      funded.state,
    );
    expect(settled.state.status).toBe("SETTLED");
    expect(settled.effects).toEqual([{ type: "PAYOUT_BENEFICIARY" }]);
  });

  it("webhook duplicado de AUTHORIZED es idempotente", () => {
    const { state, effects } = run([
      lock,
      { type: "AUTHORIZED", participantId: "carlos" },
      { type: "AUTHORIZED", participantId: "carlos" },
    ]);
    expect(state.status).toBe("OPEN");
    expect(effects).toEqual([]);
  });
});

describe("sala: el 'perro muerto' (alguien nunca paga)", () => {
  it("al vencer el plazo se anulan las retenciones y nadie paga", () => {
    const { state, effects } = run([lock, { type: "AUTHORIZED", participantId: "carlos" }, { type: "DEADLINE_REACHED" }]);
    expect(state.status).toBe("EXPIRED");
    expect(effects).toEqual([{ type: "VOID_AUTHORIZATION", participantId: "carlos" }]);
  });

  it("si alguien autoriza después de vencer, se anula automáticamente", () => {
    const { state, effects } = run([lock, { type: "DEADLINE_REACHED" }, { type: "AUTHORIZED", participantId: "juan" }]);
    expect(state.status).toBe("EXPIRED");
    expect(effects).toEqual([{ type: "VOID_AUTHORIZATION", participantId: "juan" }]);
  });

  it("el anfitrión puede cancelar antes de cobrar", () => {
    const { state, effects } = run([lock, { type: "AUTHORIZED", participantId: "juan" }, { type: "HOST_CANCELLED" }]);
    expect(state.status).toBe("CANCELLED");
    expect(effects).toContainEqual({ type: "VOID_AUTHORIZATION", participantId: "juan" });
  });

  it("no se puede cancelar cuando ya se está cobrando", () => {
    const { state } = run([
      lock,
      { type: "AUTHORIZED", participantId: "carlos" },
      { type: "AUTHORIZED", participantId: "juan" },
      { type: "CAPTURE_STARTED" },
    ]);
    expect(() => reduceRoom(state, { type: "HOST_CANCELLED" })).toThrow(TransitionError);
  });
});

describe("sala: reclamos bloquean el cobro", () => {
  it("con un reclamo abierto no se financia aunque todos autoricen", () => {
    const { state, effects } = run([
      lock,
      { type: "CLAIM_OPENED" },
      { type: "AUTHORIZED", participantId: "carlos" },
      { type: "AUTHORIZED", participantId: "juan" },
    ]);
    expect(state.status).toBe("OPEN");
    expect(effects).toEqual([]);
  });

  it("al cerrar el reclamo, quien cambió de monto debe re-autorizar", () => {
    const { state, effects } = run([
      lock,
      { type: "CLAIM_OPENED" },
      { type: "AUTHORIZED", participantId: "carlos" },
      { type: "AUTHORIZED", participantId: "juan" },
      { type: "CLAIM_CLOSED", changedParticipants: ["juan"] },
    ]);
    expect(state.status).toBe("OPEN"); // Juan quedó VOIDED, no se puede cobrar
    expect(state.payments.juan).toBe("VOIDED");
    expect(effects).toContainEqual({ type: "VOID_AUTHORIZATION", participantId: "juan" });

    const after = run([{ type: "AUTHORIZED", participantId: "juan" }], state);
    expect(after.state.status).toBe("FUNDED");
  });

  it("no se puede reclamar con la sala cerrada", () => {
    const { state } = run([lock, { type: "HOST_CANCELLED" }]);
    expect(() => reduceRoom(state, { type: "CLAIM_OPENED" })).toThrow(TransitionError);
  });
});

describe("sala: fallos de cobro", () => {
  it("un cobro fallido pasa la sala a FAILED y avisa al anfitrión", () => {
    const { state, effects } = run([
      lock,
      { type: "AUTHORIZED", participantId: "carlos" },
      { type: "AUTHORIZED", participantId: "juan" },
      { type: "CAPTURE_STARTED" },
      { type: "CAPTURED", participantId: "carlos" },
      { type: "CAPTURE_FAILED", participantId: "juan", reason: "DENIED" },
    ]);
    expect(state.status).toBe("FAILED");
    expect(effects.some((e) => e.type === "NOTIFY_HOST")).toBe(true);
  });

  it("no acepta eventos de participantes que no existen", () => {
    const { state } = run([lock]);
    expect(() => reduceRoom(state, { type: "AUTHORIZED", participantId: "intruso" })).toThrow(TransitionError);
  });

  it("no acepta pagos de participantes exentos", () => {
    const { state } = run([lock]);
    expect(() => reduceRoom(state, { type: "AUTHORIZED", participantId: "ana" })).toThrow(TransitionError);
  });
});
