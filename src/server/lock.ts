import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { initialRoom, reduceRoom } from "@/core/room-machine";
import { computeSplit } from "@/core/split";
import { db } from "./db/client";
import { logEvent, type LoadedRoom } from "./db/rooms";

/**
 * Cierra la mesa: toma lo que cada quien marcó, reparte lo que nadie marcó entre todos,
 * calcula los montos con el núcleo y abre el cobro. Lanza SplitError / TransitionError si no se puede.
 */
export async function lockTable(room: LoadedRoom, deadlineHours: number, beneficiaryEmail?: string, actor = "host", onlyPayer?: string) {
  const everyone = room.participants.map((p) => ({ participantId: p.id, weight: 1 }));
  // Modo "Feeling lucky": quien perdió el sorteo se queda con TODO; los demás no deben nada.
  const bill = {
    ...room.bill,
    items: room.bill.items.map((i) => ({
      ...i,
      assignees: onlyPayer ? [{ participantId: onlyPayer, weight: 1 }] : i.assignees.length ? i.assignees : everyone,
    })),
  };

  // El núcleo valida: todo ítem asignado y el total cuadra al centavo con el ticket.
  const split = computeSplit(bill, room.participants);
  const payers = split.shares.filter((s) => s.totalCents > 0).map((s) => s.participantId);
  const exempt = room.participants.map((p) => p.id).filter((id) => !payers.includes(id));
  const { state } = reduceRoom(initialRoom(), { type: "LOCK_SHARES", payers, exempt });

  const d = db();
  const rows = bill.items.flatMap((i) =>
    i.assignees.map((a) => ({ item_id: i.id, participant_id: a.participantId, weight: a.weight })),
  );
  const clear = await d.from("item_assignments").delete().in("item_id", bill.items.map((i) => i.id));
  if (clear.error) throw new Error(clear.error.message);
  const ins = await d.from("item_assignments").insert(rows);
  if (ins.error) throw new Error(ins.error.message);

  for (const s of split.shares) {
    const { error } = await d
      .from("participants")
      .update({ share_cents: s.totalCents, payment_status: state.payments[s.participantId] })
      .eq("id", s.participantId);
    if (error) throw new Error(error.message);
  }

  const deadline = new Date(Date.now() + deadlineHours * 3600_000).toISOString();
  const up = await d
    .from("rooms")
    .update({
      status: state.status,
      deadline_at: deadline,
      shares_version: room.sharesVersion + 1,
      beneficiary_email: beneficiaryEmail ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", room.id)
    .eq("status", "DRAFT"); // evita doble lock concurrente
  if (up.error) throw new Error(up.error.message);

  await logEvent(room.id, "ROOM_LOCKED", actor, {
    grandTotalCents: split.grandTotalCents,
    shares: split.shares.map((s) => ({ participantId: s.participantId, totalCents: s.totalCents })),
  });

  return {
    status: state.status,
    deadlineAt: deadline,
    grandTotalCents: split.grandTotalCents,
    shares: split.shares.map((s) => ({ participantId: s.participantId, totalCents: s.totalCents, lines: s.lines })),
  };
}

/**
 * "Feeling lucky": sortea quién paga todo y cierra la mesa. La semilla sale de `crypto` del servidor y el hash
 * de semilla+participantes queda guardado como comprobante. `forceLoserId` solo lo usa la demo (y se avisa en pantalla).
 */
export async function drawTable(room: LoadedRoom, deadlineHours: number, beneficiaryEmail?: string, forceLoserId?: string) {
  const ids = room.participants.map((p) => p.id);
  const seed = randomBytes(16).toString("hex");
  const loserId = forceLoserId ?? ids[parseInt(seed.slice(0, 8), 16) % ids.length];
  const proof = createHash("sha256").update(`${seed}:${ids.join(",")}`).digest("hex");
  const result = await lockTable(room, deadlineHours, beneficiaryEmail, forceLoserId ? "demo" : "host", loserId);
  await db().from("rooms").update({ draw_proof: proof, loser_id: loserId }).eq("id", room.id);
  await logEvent(room.id, "DRAW", "system", { loserId, proof, seed, participants: ids, rigged: !!forceLoserId });
  return { ...result, loserId };
}
