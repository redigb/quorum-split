import { TransitionError } from "@/core/room-machine";
import { guard } from "@/server/auth";
import { applyEvent } from "@/server/room-actions";

/** El anfitrión cancela: se anulan todas las retenciones y nadie paga. Solo antes de empezar a cobrar. */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const g = await guard(request, code, "host");
  if (!g.ok) return g.response;
  try {
    const state = await applyEvent(g.room, { type: "HOST_CANCELLED" }, "host");
    return Response.json({ status: state.status });
  } catch (e) {
    if (e instanceof TransitionError) return Response.json({ error: "cannot_cancel" }, { status: 409 });
    console.error("cancel", e);
    return Response.json({ error: "cancel_failed" }, { status: 500 });
  }
}
