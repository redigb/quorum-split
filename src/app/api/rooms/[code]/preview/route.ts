import { loadRoom } from "@/server/db/rooms";

/** Lo mínimo que ve quien abre el enlace de la mesa antes de unirse. Sin token: no revela montos ni nombres. */
export async function GET(_request: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const room = await loadRoom(code);
  if (!room) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({
    code: room.code,
    status: room.status,
    merchant: room.merchant,
    currency: room.bill.currency,
    people: room.participants.length,
    joinable: room.status === "DRAFT" && room.participants.length < 20,
  });
}

