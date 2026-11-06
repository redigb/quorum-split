import { z } from "zod";
import { TransitionError } from "@/core/room-machine";
import { SplitError } from "@/core/split";
import { guard } from "@/server/auth";
import { drawTable, lockTable } from "@/server/lock";

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
      return Response.json(await drawTable(room, body.data.deadlineHours, body.data.beneficiaryEmail));
    }
    return Response.json(await lockTable(room, body.data.deadlineHours, body.data.beneficiaryEmail));
  } catch (e) {
    if (e instanceof SplitError) return Response.json({ error: e.code, message: e.message }, { status: 422 });
    if (e instanceof TransitionError) return Response.json({ error: "invalid_transition" }, { status: 409 });
    console.error("lock", e);
    return Response.json({ error: "lock_failed" }, { status: 500 });
  }
}
