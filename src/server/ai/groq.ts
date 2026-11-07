/**
 * Cliente de Groq (API compatible con OpenAI, vía fetch: sin dependencias extra).
 * SOLO SERVIDOR: usa GROQ_API_KEY. Nunca importar desde un componente de cliente.
 *
 * Modelos configurables por .env porque Groq rota su catálogo. Verificar en console.groq.com/docs/models.
 */
import { assignmentSystem, claimSystem, DICTATION_SYSTEM, RECEIPT_SYSTEM, wrapUserInput } from "./prompts";

const BASE = "https://api.groq.com/openai/v1";
const MODELS = {
  vision: process.env.GROQ_VISION_MODEL ?? "qwen/qwen3.8-27b",
  text: process.env.GROQ_TEXT_MODEL ?? "openai/gpt-oss-120b",
  speech: process.env.GROQ_SPEECH_MODEL ?? "whisper-large-v3-turbo",
};

function apiKey(): string {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("Falta GROQ_API_KEY en .env.local");
  return key;
}

type Message =
  | { role: "system" | "user" | "assistant"; content: string }
  | { role: "user"; content: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> };

async function chatJson(model: string, messages: Message[]): Promise<unknown> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0, // determinista: queremos extracción, no creatividad
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  const content = data.choices[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(content);
  } catch {
    throw new Error("La IA devolvió JSON inválido");
  }
}

/** Foto del ticket -> JSON crudo (validar con receiptToDraft). imageUrl puede ser un data URL base64. */
export function extractReceipt(imageUrl: string) {
  return chatJson(MODELS.vision, [
    { role: "system", content: RECEIPT_SYSTEM },
    {
      role: "user",
      content: [
        { type: "text", text: "Extract this receipt." },
        { type: "image_url", image_url: { url: imageUrl } },
      ],
    },
  ]);
}

/** Texto/voz transcrita -> propuesta de asignación (validar con applyAssignmentProposal). */
export function proposeAssignments(
  text: string,
  items: { id: string; name: string }[],
  people: { id: string; name: string }[],
) {
  return chatJson(MODELS.text, [
    { role: "system", content: assignmentSystem(items, people) },
    { role: "user", content: wrapUserInput(text) },
  ]);
}

/** Mensaje del participante -> intención de reclamo (validar con sanitizeClaimIntent). */
export function interpretClaim(
  text: string,
  self: { id: string; name: string },
  items: { id: string; name: string; owners: string[] }[],
  people: { id: string; name: string }[],
) {
  return chatJson(MODELS.text, [
    { role: "system", content: claimSystem(self, items, people) },
    { role: "user", content: wrapUserInput(text.slice(0, 500)) },
  ]);
}

/** Cuenta dictada en voz (ya transcrita) -> JSON crudo con la misma forma que la lectura del ticket. */
export function dictateReceipt(text: string) {
  return chatJson(MODELS.text, [
    { role: "system", content: DICTATION_SYSTEM },
    { role: "user", content: wrapUserInput(text.slice(0, 1500)) },
  ]);
}

/** Nota de voz -> texto (Whisper en Groq). */
export async function transcribe(audio: Blob, filename = "audio.webm", lang?: string): Promise<string> {
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", MODELS.speech);
  form.append("temperature", "0");
  // Whisper adivina mal el idioma en clips cortos; si la persona lo indica, se fija. Sin indicarlo, se detecta.
  if (lang === "es" || lang === "en") form.append("language", lang);
  // Sesga hacia cuentas de restaurante: platos, cantidades y precios en cifras ("2 pizzas a 20").
  form.append("prompt", lang === "en" ? "Restaurant bill: 2 pizzas at 20 each, a beer 10, tip 5." : "Cuenta de restaurante: 2 pizzas a 20 cada una, una cerveza 10, propina 5. Restaurant bill.");
  const res = await fetch(`${BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Groq audio ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { text: string };
  return data.text;
}
