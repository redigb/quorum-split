import { ZodError } from "zod";
import { proposeAssignments, transcribe } from "@/server/ai/groq";
import { applyAssignmentProposal } from "@/server/ai/schemas";
import { guard } from "@/server/auth";
import { db } from "@/server/db/client";
import { logEvent } from "@/server/db/rooms";

export const maxDuration = 30;

const MAX_BYTES = 2.5 * 1024 * 1024; // ~ un minuto y medio de voz
const EXT: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-m4a": "m4a" };

/**
 * Modo de voz: nota de voz -> texto (Whisper) -> propuesta de asignación (IA) -> se aplica.
 *  - Participante: solo mueve LO SUYO ("yo comí la carbonara y compartí el agua con Leo"). Lo que dice de otros no se toca.
 *  - Anfitrión: dicta la asignación de toda la mesa.
 * La IA solo interpreta; las reglas de qué se puede cambiar son de este servidor.
 */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const g = await guard(request, code, "any");
  if (!g.ok) return g.response;
  const { room, who } = g;
  if (room.status !== "DRAFT" || room.mode !== "fair") return Response.json({ error: "not_available" }, { status: 409 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "missing_audio" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "audio_too_long" }, { status: 413 });
  const base = file.type.split(";")[0];
  if (!EXT[base]) return Response.json({ error: "unsupported_type" }, { status: 415 });

  const speaker = who.participantId ? room.participants.find((p) => p.id === who.participantId) : undefined;

  try {
    const transcript = (await transcribe(file, `voice.${EXT[base]}`)).trim();
    if (!transcript) return Response.json({ error: "no_speech" }, { status: 422 });

    const raw = await proposeAssignments(
      speaker ? `The speaker is ${speaker.name}; "I", "me" and "my" mean ${speaker.name}. ${transcript}` : transcript,
      room.bill.items.map((i) => ({ id: i.id, name: i.name })),
      room.participants.map((p) => ({ id: p.id, name: p.name })),
    );
    const { items: proposed, ignored } = applyAssignmentProposal(raw, room.bill.items, room.participants.map((p) => p.id));

    let changed = 0;
    for (const next of proposed) {
      const now = room.bill.items.find((i) => i.id === next.id)!;
      const was = new Set(now.assignees.map((a) => a.participantId));
      const will = new Set(next.assignees.map((a) => a.participantId));
      // Cada persona solo cambia lo suyo; el anfitrión puede cambiar a cualquiera.
      const scope = speaker ? [speaker.id] : room.participants.map((p) => p.id);
      for (const pid of scope) {
        if (will.has(pid) === was.has(pid)) continue;
        const q = will.has(pid)
          ? db().from("item_assignments").upsert({ item_id: next.id, participant_id: pid, weight: 1 }, { onConflict: "item_id,participant_id" })
          : db().from("item_assignments").delete().eq("item_id", next.id).eq("participant_id", pid);
        const { error } = await q;
        if (error) throw new Error(error.message);
        changed++;
      }
    }

    await logEvent(room.id, "VOICE_ASSIGNMENT", speaker ? `participant:${speaker.id}` : "host", { changed, ignored: ignored.length });
    return Response.json({ transcript, changed, ignored });
  } catch (e) {
    if (e instanceof ZodError) return Response.json({ error: "unreadable_proposal" }, { status: 422 });
    console.error("voice", e);
    return Response.json({ error: "voice_failed" }, { status: 502 });
  }
}
