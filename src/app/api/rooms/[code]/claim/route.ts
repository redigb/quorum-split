import { guard, sessionUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { logEvent } from "@/server/db/rooms";

/** Asocia la sala a la cuenta. Hay que tener el token de anfitrión (prueba de que es tuya) Y una sesión. Idempotente. */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const uid = await sessionUser(request);
  if (!uid) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const g = await guard(request, code, "host");
  if (!g.ok) return g.response;
  if (g.room.ownerId === uid) return Response.json({ ok: true, already: true });
  if (g.room.ownerId) return Response.json({ error: "owned_by_someone_else" }, { status: 409 });

  const { data, error } = await db()
    .from("rooms")
    .update({ owner_id: uid })
    .eq("id", g.room.id)
    .is("owner_id", null) // evita que dos cuentas la reclamen a la vez
    .select("id");
  if (error) return Response.json({ error: "claim_failed" }, { status: 500 });
  if (!data?.length) return Response.json({ error: "owned_by_someone_else" }, { status: 409 });

  await logEvent(g.room.id, "ROOM_CLAIMED", "host", { owner: uid });
  return Response.json({ ok: true });
}
