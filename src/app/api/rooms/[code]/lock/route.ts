import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { TransitionError } from "@/core/room-machine";
import { SplitError } from "@/core/split";
import { guard } from "@/server/auth";
import { db } from "@/server/db/client";
import { logEvent } from "@/server/db/rooms";
import { lockTable } from "@/server/lock";

const MAX_HOURS = 72; // "honor period" de PayPal

const Body = z.object({
  deadlineHours: z.number().int().min(1).max(MAX_HOURS).default(48),
  beneficiaryEmail: z.email().optional(),
});

/** Cierra la mesa (ver `lockTable`): lo marcado por cada quien, lo no marcado entre todos, y abre el cobro. */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const g = await guard(request, code, "host");
  if (!g.ok) return g.response;
  const { room } = g;
  if (room.status !== "DRAFT") return Response.json({ error: "room_not_draft" }, { status: 409 });
  if (room.participants.length < 2) return Response.json({ error: "need_two_people", message: "Wait for at least one more person to join." }, { status: 422 });

  const body = Body.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return Response.json({ error: "invalid_body", issues: body.error.issues }, { status: 400 });

  try {
    if (room.mode === "lucky") {
      if (!room.participants.every((p) => p.luckyOk)) {
        return Response.json({ error: "not_everyone_in", message: "Everyone has to say yes before the draw." }, { status: 409 });
      }
      // Sorteo: semilla aleatoria del servidor (crypto) -> índice. El hash de semilla+participantes queda guardado como comprobante.
      const ids = room.participants.map((p) => p.id);
      const seed = randomBytes(16).toString("hex");
      const loserId = ids[parseInt(seed.slice(0, 8), 16) % ids.length];
      const proof = createHash("sha256").update(`${seed}:${ids.join(",")}`).digest("hex");
      const result = await lockTable(room, body.data.deadlineHours, body.data.beneficiaryEmail, "host", loserId);
      await db().from("rooms").update({ draw_proof: proof, loser_id: loserId }).eq("id", room.id);
      await logEvent(room.id, "DRAW", "system", { loserId, proof, seed, participants: ids });
      return Response.json({ ...result, loserId });
    }
    return Response.json(await lockTable(room, body.data.deadlineHours, body.data.beneficiaryEmail));
  } catch (e) {
    if (e instanceof SplitError) return Response.json({ error: e.code, message: e.message }, { status: 422 });
    if (e instanceof TransitionError) return Response.json({ error: "invalid_transition" }, { status: 409 });
    console.error("lock", e);
    return Response.json({ error: "lock_failed" }, { status: 500 });
  }
}
