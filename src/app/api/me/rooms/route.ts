import { sessionUser } from "@/server/auth";
import { db } from "@/server/db/client";

/** Panel "Mis salas": estado y dinero de cada sala de la cuenta. */
export async function GET(request: Request) {
  const uid = await sessionUser(request);
  if (!uid) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const { data: rooms, error } = await db()
    .from("rooms")
    .select("code, status, merchant, currency, deadline_at, created_at, id")
    .eq("owner_id", uid)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return Response.json({ error: "query_failed" }, { status: 500 });
  if (!rooms.length) return Response.json({ rooms: [] });

  const { data: parts, error: pErr } = await db()
    .from("participants")
    .select("room_id, share_cents, payment_status")
    .in("room_id", rooms.map((r) => r.id));
  if (pErr) return Response.json({ error: "query_failed" }, { status: 500 });

  return Response.json({
    rooms: rooms.map((r) => {
      const ps = (parts ?? []).filter((p) => p.room_id === r.id && p.payment_status !== "EXEMPT");
      const sumOf = (...st: string[]) =>
        ps.filter((p) => st.includes(p.payment_status)).reduce((a, p) => a + Number(p.share_cents), 0);
      return {
        code: r.code,
        status: r.status,
        merchant: r.merchant,
        currency: r.currency,
        deadlineAt: r.deadline_at,
        createdAt: r.created_at,
        totalCents: ps.reduce((a, p) => a + Number(p.share_cents), 0),
        collectedCents: sumOf("CAPTURED"), // ya cobrado
        heldCents: sumOf("AUTHORIZED"), // retenido, aún no cobrado
        confirmed: ps.filter((p) => ["AUTHORIZED", "CAPTURED"].includes(p.payment_status)).length,
        payers: ps.length,
      };
    }),
  });
}
