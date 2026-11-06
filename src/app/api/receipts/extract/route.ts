import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { isSupportedCurrency } from "@/core/money";
import { extractReceipt } from "@/server/ai/groq";
import { receiptToDraft } from "@/server/ai/schemas";

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Foto del ticket -> borrador de cuenta (sin asignar). No guarda nada: el borrador lo confirma el anfitrión. */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("image");
  if (!(file instanceof File)) return Response.json({ error: "missing_image" }, { status: 400 });
  if (!TYPES.has(file.type)) return Response.json({ error: "unsupported_type" }, { status: 415 });
  if (file.size > MAX_BYTES) return Response.json({ error: "image_too_large" }, { status: 413 });

  const fallback = String(form?.get("currency") ?? "USD").toUpperCase();
  const currency = isSupportedCurrency(fallback) ? fallback : "USD";

  try {
    const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const raw = await extractReceipt(`data:${file.type};base64,${b64}`);
    return Response.json({ draft: receiptToDraft(raw, currency, randomUUID) });
  } catch (e) {
    if (e instanceof ZodError) {
      return Response.json({ error: "unreadable_receipt" }, { status: 422 });
    }
    console.error("POST /api/receipts/extract", e);
    return Response.json({ error: "extraction_failed" }, { status: 502 });
  }
}
