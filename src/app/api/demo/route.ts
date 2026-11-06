import { z } from "zod";
import { db } from "@/server/db/client";
import { createRoom, loadRoom } from "@/server/db/rooms";
import { lockTable } from "@/server/lock";

const Body = z.object({ name: z.string().trim().min(1).max(40).default("You"), mode: z.enum(["fair", "lucky"]).default("fair") });

/** Una mesa de ejemplo ya armada: tres amigos simulados y quien prueba, que paga la última parte. */
const ITEMS = [
  { name: "Margherita pizza", cents: 1800, by: ["Maya"] },
  { name: "Carbonara", cents: 2100, by: ["Leo"] },
  { name: "Burrata to share", cents: 1400, by: ["Maya", "Leo", "Sofia", "GUEST"] },
  { name: "Lasagna", cents: 2000, by: ["Sofia"] },
  { name: "Sparkling water", cents: 600, by: ["Leo", "Sofia"] },
  { name: "Tiramisu", cents: 950, by: ["GUEST"] },
  { name: "Negroni", cents: 1200, by: ["GUEST"] },
];
const TIP_CENTS = 1005;
const TOTAL_CENTS = ITEMS.reduce((n, i) => n + i.cents, 0) + TIP_CENTS;
// Cada amigo "confirma" a su hora (lo aplica el servidor al consultar la sala).
const CONFIRM_AFTER_S: Record<string, number> = { Leo: 3, Sofia: 6, Maya: 9 };

export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  const guest = body.data.name;
  if (["maya", "leo", "sofia"].includes(guest.toLowerCase())) return Response.json({ error: "name_taken" }, { status: 409 });

  try {
    const created = await createRoom({
      hostName: "Maya",
      participantNames: ["Leo", "Sofia", guest],
      merchant: "Trattoria Quorum (demo)",
      currency: "USD",
      printedTotalCents: TOTAL_CENTS,
      items: ITEMS.map((i) => ({ name: i.name, quantity: 1, lineTotalCents: i.cents })),
      charges: [{ kind: "tip", label: "Tip 10%", amountCents: TIP_CENTS, split: "proportional" }],
    });

    const room = (await loadRoom(created.code))!;
    const lucky = body.data.mode === "lucky";
    const idOf = (name: string) => room.participants.find((p) => p.name === (name === "GUEST" ? guest : name))!.id;
    const rows = lucky ? [] : ITEMS.flatMap((it) => {
      const item = room.bill.items.find((x) => x.name === it.name)!;
      return it.by.map((n) => ({ item_id: item.id, participant_id: idOf(n), weight: 1 }));
    });
    const now = Date.now();
    if (lucky) {
      // Feeling lucky: los amigos simulados ya dijeron que si; falta quien prueba. Al aceptar, el servidor sortea (ver auth.ts).
      await db().from("rooms").update({ mode: "lucky" }).eq("id", room.id);
      for (const name of Object.keys(CONFIRM_AFTER_S)) {
        const { error } = await db()
          .from("participants")
          .update({ sim_confirm_at: new Date(now).toISOString(), lucky_ok: true })
          .eq("id", idOf(name));
        if (error) throw new Error(error.message);
      }
    } else {
      const ins = await db().from("item_assignments").insert(rows);
      if (ins.error) throw new Error(ins.error.message);

      await lockTable((await loadRoom(created.code))!, 24, undefined, "demo");

      for (const [name, secs] of Object.entries(CONFIRM_AFTER_S)) {
        const { error } = await db()
          .from("participants")
          .update({ sim_confirm_at: new Date(now + secs * 1000).toISOString() })
          .eq("id", idOf(name));
        if (error) throw new Error(error.message);
      }
    }

    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const me = created.participants.find((p) => p.name === guest)!;
    return Response.json(
      {
        code: created.code,
        hostUrl: `${base}/r/${created.code}/host?t=${created.hostToken}`,
        myToken: me.token,
        tablePath: `/t/${created.code}`,
      },
      { status: 201 },
    );
  } catch (e) {
    console.error("POST /api/demo", e);
    return Response.json({ error: "demo_failed" }, { status: 500 });
  }
}
