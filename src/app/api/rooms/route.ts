import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "@/core/money";
import { createRoom } from "@/server/db/rooms";

const cents = z.number().int().safe();

const Body = z.object({
  hostName: z.string().trim().min(1).max(60),
  participantNames: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  merchant: z.string().trim().max(120).nullable().default(null),
  currency: z.enum(SUPPORTED_CURRENCIES),
  printedTotalCents: cents.nonnegative().optional(),
  receiptImagePath: z.string().max(300).optional(),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        quantity: z.number().positive().max(999).default(1),
        lineTotalCents: cents,
      }),
    )
    .min(1)
    .max(100),
  charges: z
    .array(
      z.object({
        kind: z.enum(["tax", "tip", "service", "delivery", "other"]),
        label: z.string().trim().min(1).max(60),
        amountCents: cents,
        split: z.enum(["proportional", "equal"]).default("proportional"),
      }),
    )
    .max(10)
    .default([]),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const room = await createRoom(parsed.data);
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    return Response.json(
      {
        code: room.code,
        hostUrl: `${base}/r/${room.code}/host?t=${room.hostToken}`,
        participants: room.participants.map((p) => ({
          id: p.id,
          name: p.name,
          isHost: p.isHost,
          url: `${base}/r/${room.code}/p/${p.token}`,
        })),
      },
      { status: 201 },
    );
  } catch (e) {
    console.error("POST /api/rooms", e);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
