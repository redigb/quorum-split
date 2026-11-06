import { z, ZodError } from "zod";
import { proposeAssignments } from "@/server/ai/groq";
import { applyAssignmentProposal } from "@/server/ai/schemas";
import { guard } from "@/server/auth";
import { logEvent } from "@/server/db/rooms";

const Body = z.object({ text: z.string().trim().min(1).max(1000) });

/** Texto -> PROPUESTA de asignación. No guarda nada: el anfitrión la confirma al hacer lock. */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const g = await guard(request, code, "host");
  if (!g.ok) return g.response;
  if (g.room.status !== "DRAFT") return Response.json({ error: "room_not_draft" }, { status: 409 });

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  try {
    const raw = await proposeAssignments(
      body.data.text,
      g.room.bill.items.map((i) => ({ id: i.id, name: i.name })),
      g.room.participants.map((p) => ({ id: p.id, name: p.name })),
    );
    const { items, ignored } = applyAssignmentProposal(
      raw,
      g.room.bill.items,
      g.room.participants.map((p) => p.id),
    );
    await logEvent(g.room.id, "AI_ASSIGNMENT_PROPOSED", "ai", { ignored: ignored.length });
    return Response.json({
      proposal: items.map((i) => ({ itemId: i.id, assignees: i.assignees })),
      ignored,
    });
  } catch (e) {
    if (e instanceof ZodError) return Response.json({ error: "unreadable_proposal" }, { status: 422 });
    console.error("assign", e);
    return Response.json({ error: "assignment_failed" }, { status: 502 });
  }
}
