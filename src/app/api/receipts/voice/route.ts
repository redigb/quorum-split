import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { isSupportedCurrency } from "@/core/money";
import { dictateReceipt, transcribe } from "@/server/ai/groq";
import { receiptToDraft } from "@/server/ai/schemas";
import { limited } from "@/server/rate-limit";

export const maxDuration = 30;

const MAX_BYTES = 2.5 * 1024 * 1024;
const EXT: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-m4a": "m4a" };

/** Cuenta dictada ("dos pizzas a 20 y una cerveza de 10") -> borrador de cuenta. Igual que la foto: no guarda nada. */
export async function POST(request: Request) {
  const tooMany = limited(request, "voice", 20, 10 * 60_000);
  if (tooMany) return tooMany;
  const form = await request.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "missing_audio" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "audio_too_long" }, { status: 413 });
  const ext = EXT[file.type.split(";")[0]];
  if (!ext) return Response.json({ error: "unsupported_type" }, { status: 415 });

  const fallback = String(form?.get("currency") ?? "USD").toUpperCase();
  const currency = isSupportedCurrency(fallback) ? fallback : "USD";

  const lang = String(form?.get("lang") ?? "");
  let transcript = "";
  try {
    transcript = (await transcribe(file, `voice.${ext}`, lang)).trim();
    if (!transcript) return Response.json({ error: "no_speech" }, { status: 422 });
    const raw = await dictateReceipt(transcript);
    return Response.json({ transcript, draft: receiptToDraft(raw, currency, randomUUID) });
  } catch (e) {
    if (e instanceof ZodError) return Response.json({ error: "unreadable_dictation", transcript }, { status: 422 });
    console.error("POST /api/receipts/voice", e);
    return Response.json({ error: "voice_failed" }, { status: 502 });
  }
}
