import "server-only";
import type { Currency } from "@/core/money";
import type { Bill, Participant } from "@/core/types";
import { db } from "./client";
import { hashToken, newRoomCode, newToken, tokenMatches } from "./tokens";

export interface NewRoomInput {
  hostName: string;
  participantNames: string[];
  merchant: string | null;
  currency: Currency;
  printedTotalCents?: number;
  receiptImagePath?: string;
  items: { name: string; quantity: number; lineTotalCents: number }[];
  charges: Bill["charges"];
}

export interface CreatedRoom {
  code: string;
  hostToken: string;
  /** Token privado de cada participante (el anfitrión incluido), para armar sus enlaces. */
  participants: { id: string; name: string; isHost: boolean; token: string }[];
}

function fail(what: string, error: { message: string } | null): asserts error is null {
  if (error) throw new Error(`${what}: ${error.message}`);
}

export async function logEvent(roomId: string, type: string, actor: string, payload: object = {}) {
  const { error } = await db().from("ledger_events").insert({ room_id: roomId, type, actor, payload });
  fail("ledger", error);
}

export async function createRoom(input: NewRoomInput): Promise<CreatedRoom> {
  const hostToken = newToken();
  let room: { id: string; code: string } | null = null;

  // El código es corto: reintenta si choca con uno existente (unique).
  for (let attempt = 0; attempt < 5 && !room; attempt++) {
    const { data, error } = await db()
      .from("rooms")
      .insert({
        code: newRoomCode(),
        currency: input.currency,
        merchant: input.merchant,
        receipt_image_path: input.receiptImagePath ?? null,
        printed_total_cents: input.printedTotalCents ?? null,
        host_token_hash: hashToken(hostToken),
      })
      .select("id, code")
      .single();
    if (!error) room = data;
    else if (error.code !== "23505") fail("crear sala", error);
  }
  if (!room) throw new Error("No se pudo generar un código de sala único");

  try {
    const people = [
      { name: input.hostName, is_host: true },
      ...input.participantNames.map((name) => ({ name, is_host: false })),
    ].map((p) => ({ ...p, token: newToken() }));

    const { data: parts, error: pErr } = await db()
      .from("participants")
      .insert(
        people.map((p) => ({
          room_id: room.id,
          name: p.name,
          is_host: p.is_host,
          access_token_hash: hashToken(p.token),
        })),
      )
      .select("id, name, is_host, access_token_hash");
    fail("participantes", pErr);

    if (input.items.length) {
      const { error } = await db()
        .from("items")
        .insert(
          input.items.map((it, position) => ({
            room_id: room.id,
            position,
            name: it.name,
            quantity: it.quantity,
            line_total_cents: it.lineTotalCents,
          })),
        );
      fail("ítems", error);
    }
    if (input.charges.length) {
      const { error } = await db()
        .from("charges")
        .insert(
          input.charges.map((c) => ({
            room_id: room.id,
            kind: c.kind,
            label: c.label,
            amount_cents: c.amountCents,
            split: c.split,
          })),
        );
      fail("cargos", error);
    }

    await logEvent(room.id, "ROOM_CREATED", "host", { items: input.items.length, participants: people.length });

    return {
      code: room.code,
      hostToken,
      participants: (parts ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        isHost: row.is_host,
        // Cada fila coincide con su token por el hash.
        token: people.find((p) => hashToken(p.token) === row.access_token_hash)!.token,
      })),
    };
  } catch (e) {
    // Sin transacción multi-tabla vía REST: si algo falla, borramos la sala (cascade limpia el resto).
    await db().from("rooms").delete().eq("id", room.id);
    throw e;
  }
}

export interface LoadedRoom {
  id: string;
  code: string;
  status: string;
  merchant: string | null;
  deadlineAt: string | null;
  sharesVersion: number;
  hostTokenHash: string;
  ownerId: string | null;
  bill: Bill;
  participants: (Participant & { tokenHash: string; paymentStatus: string; shareCents: number })[];
}

export async function loadRoom(code: string): Promise<LoadedRoom | null> {
  const { data: room, error } = await db().from("rooms").select("*").eq("code", code.toUpperCase()).maybeSingle();
  fail("cargar sala", error);
  if (!room) return null;

  const [parts, items, assigns, charges] = await Promise.all([
    db().from("participants").select("*").eq("room_id", room.id).order("created_at"),
    db().from("items").select("*").eq("room_id", room.id).order("position"),
    db().from("item_assignments").select("item_id, participant_id, weight, items!inner(room_id)").eq("items.room_id", room.id),
    db().from("charges").select("*").eq("room_id", room.id),
  ]);
  fail("participantes", parts.error);
  fail("ítems", items.error);
  fail("asignaciones", assigns.error);
  fail("cargos", charges.error);

  return {
    id: room.id,
    code: room.code,
    status: room.status,
    merchant: room.merchant,
    deadlineAt: room.deadline_at,
    sharesVersion: room.shares_version,
    hostTokenHash: room.host_token_hash,
    ownerId: room.owner_id ?? null,
    bill: {
      currency: room.currency as Currency,
      printedTotalCents: room.printed_total_cents ?? undefined,
      items: (items.data ?? []).map((it) => ({
        id: it.id,
        name: it.name,
        quantity: Number(it.quantity),
        lineTotalCents: Number(it.line_total_cents),
        assignees: (assigns.data ?? [])
          .filter((a) => a.item_id === it.id)
          .map((a) => ({ participantId: a.participant_id, weight: a.weight })),
      })),
      charges: (charges.data ?? []).map((c) => ({
        kind: c.kind,
        label: c.label,
        amountCents: Number(c.amount_cents),
        split: c.split,
      })),
    },
    participants: (parts.data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.is_host,
      tokenHash: p.access_token_hash,
      paymentStatus: p.payment_status,
      shareCents: Number(p.share_cents),
    })),
  };
}

export async function loadRoomById(id: string): Promise<LoadedRoom | null> {
  const { data, error } = await db().from("rooms").select("code").eq("id", id).maybeSingle();
  fail("buscar sala", error);
  return data ? loadRoom(data.code) : null;
}

/** Quién es el dueño del token: el anfitrión, un participante, o nadie. */
export function identify(room: LoadedRoom, token: string | null | undefined) {
  if (!token) return null;
  if (tokenMatches(token, room.hostTokenHash)) return { role: "host" as const, participantId: null };
  const p = room.participants.find((x) => tokenMatches(token, x.tokenHash));
  return p ? { role: "participant" as const, participantId: p.id } : null;
}
