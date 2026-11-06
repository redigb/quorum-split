import { guard } from "@/server/auth";
import { db } from "@/server/db/client";

interface Row {
  at: string;
  actor: string;
  event: string;
  detail: string;
  amountCents: number | null;
  paypal: string | null;
  tone: "muted" | "hold" | "ok" | "accent";
}

/** Libro mayor de la sala (solo anfitrión): cada evento con quién, cuánto y qué dijo PayPal. */
export async function GET(request: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const g = await guard(request, code, "host");
  if (!g.ok) return g.response;
  const { room } = g;

  const { data, error } = await db()
    .from("ledger_events")
    .select("id, type, actor, payload, created_at")
    .eq("room_id", room.id)
    .order("id");
  if (error) return Response.json({ error: "ledger_failed" }, { status: 500 });

  const person = (id?: string) => room.participants.find((p) => p.id === id);
  const host = room.participants.find((p) => p.isHost);
  const billTotal =
    room.bill.items.reduce((n, i) => n + i.lineTotalCents, 0) + room.bill.charges.reduce((n, c) => n + c.amountCents, 0);

  const rows: Row[] = (data ?? []).map((e) => {
    const pl = (e.payload ?? {}) as Record<string, unknown>;
    const pid = (pl.participantId as string | undefined) ?? (e.actor.startsWith("participant:") ? e.actor.slice(12) : undefined);
    const who = person(pid);
    const actor =
      e.actor === "host" ? (host?.name ?? "Organizer") : e.actor === "paypal" ? "PayPal" : e.actor.startsWith("participant:") ? (person(pid)?.name ?? "Someone") : "Quorum";
    const share = who?.shareCents ?? null;
    const actorName = e.type === "PARTICIPANT_JOINED" ? String(pl.name ?? actor) : actor;
    const row = (event: string, detail: string, amountCents: number | null, paypal: string | null, tone: Row["tone"]): Row => ({
      at: e.created_at,
      actor: actorName,
      event,
      detail,
      amountCents,
      paypal,
      tone,
    });

    switch (e.type) {
      case "ROOM_CREATED":
        return row("ROOM_CREATED", `${pl.items ?? room.bill.items.length} items`, billTotal, null, "muted");
      case "PARTICIPANT_JOINED":
        return row("JOINED", `${pl.name ?? "someone"} sat down`, null, null, "muted");
      case "PARTICIPANT_RENAMED":
        return row("RENAMED", `${pl.from} → ${pl.to}`, null, null, "muted");
      case "PARTICIPANT_REMOVED":
        return row("REMOVED", `${pl.name} left the table`, null, null, "muted");
      case "ROOM_LOCKED": {
        const shares = (pl.shares as { totalCents: number }[] | undefined) ?? [];
        return row("ROOM_LOCKED", `${shares.filter((s) => s.totalCents > 0).length} paying`, (pl.grandTotalCents as number) ?? billTotal, null, "accent");
      }
      case "DRAW":
        return row("DRAWN", `${person(pl.loserId as string)?.name ?? "someone"} pays it all`, billTotal, null, "accent");
      case "ORDER_CREATED":
        return row("ORDER_CREATED", `${who?.name ?? "someone"} opened PayPal`, share, "CREATED", "muted");
      case "AUTHORIZED":
        return row("AUTHORIZED", `${who?.name ?? "someone"} · hold placed`, share, "AUTHORIZED", "hold");
      case "CAPTURE_STARTED":
        return row("CAPTURING", "everyone confirmed · charging all at once", billTotal, null, "accent");
      case "CAPTURED":
        return row("CAPTURED", `${who?.name ?? "someone"} paid`, share, "COMPLETED", "ok");
      case "CAPTURE_FAILED":
        return row("CAPTURE_FAILED", `${who?.name ?? "someone"} · payment failed`, share, "FAILED", "accent");
      case "AUTHORIZATION_VOIDED":
      case "AUTHORIZATION_VOIDED_PAYPAL":
        return row("HOLD_RELEASED", `${who?.name ?? "someone"} · nobody charged`, share, "VOIDED", "muted");
      case "DEADLINE_REACHED":
        return row("EXPIRED", "time ran out · holds released", null, null, "muted");
      case "HOST_CANCELLED":
        return row("CANCELLED", "organizer cancelled · holds released", null, null, "muted");
      default:
        return row(e.type, "", null, null, "muted");
    }
  });

  return Response.json({ currency: room.bill.currency, rows });
}
