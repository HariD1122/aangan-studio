import { z } from "zod";

/** Pure helpers for VaaniVoice webhooks and the Gemini notes. No network, so they are easy to test. */

const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

export type ParsedEvent = {
  event: string | null; callId: string | null; roomName: string | null; phone: string | null;
  status: string | null; durationSeconds: number | null; endReason: string | null;
  summary: string | null; transcript: string | null; entities: unknown; dispositions: unknown; recordingUrl: string | null;
};

/** The `call_postprocessing` event nests its fields under `data`; the other events are flat. Accept both shapes. */
export function parseWebhook(body: unknown): ParsedEvent {
  const top = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const data = (top.data && typeof top.data === "object" ? top.data : {}) as Record<string, unknown>;
  const pick = (k: string) => data[k] ?? top[k];
  const dur = Number(pick("call_duration"));
  const isPost = top.event === "call_postprocessing";
  return {
    event: str(top.event),
    callId: str(pick("call_id")),
    roomName: str(pick("room_name")),
    phone: str(pick("phone_number")) ?? str(pick("contact_number")),
    status: str(pick("status")),
    // docs: call_postprocessing reports milliseconds, call_ended reports seconds
    durationSeconds: Number.isFinite(dur) && dur > 0 ? (isPost ? dur / 1000 : dur) : null,
    endReason: str(pick("end_reason")),
    summary: str(pick("summary")),
    transcript: typeof pick("transcript") === "string" ? str(pick("transcript")) : transcriptFromTurns(pick("transcript")),
    entities: pick("entities") ?? pick("entity") ?? null,
    dispositions: pick("dispositions") ?? null,
    recordingUrl: str(pick("recording_url")),
  };
}

/** If a transcript arrives as a list of turns, flatten it to "AGENT: ... / USER: ..." text. */
function transcriptFromTurns(v: unknown): string | null {
  if (!Array.isArray(v)) return null;
  const lines = v.map((t) => {
    const o = (t ?? {}) as Record<string, unknown>;
    const who = String(o.role ?? o.speaker ?? "").toUpperCase();
    const text = str(o.text) ?? str(o.content) ?? str(o.message);
    return text ? `${who || "SPEAKER"}: ${text}` : null;
  }).filter(Boolean);
  return lines.length ? lines.join("\n") : null;
}

// ---------- what Gemini must return ----------
const num = z.number().finite().nonnegative().nullable();
export const NotesSchema = z.object({
  short_notes: z.array(z.string().max(220)).max(6),
  customer_name: z.string().max(120).nullable(),
  project_type: z.string().max(120).nullable(),
  property_type: z.string().max(120).nullable(),
  project_location: z.string().max(200).nullable(),
  area_value: z.number().positive().nullable(),
  area_unit: z.enum(["sqft", "sqm"]).nullable(),
  budget_min: num,
  budget_max: num,
  timeline: z.string().max(200).nullable(),
  // Gemini sometimes returns a list here; join it into one sentence instead of rejecting a good answer
  requirements: z.preprocess((v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").join("; ") || null : v), z.string().max(1500).nullable()),
  customer_questions: z.array(z.string().max(200)).max(8),
  follow_ups: z.array(z.string().max(200)).max(8),
  qualification: z.enum(["qualified", "not_qualified", "needs_review"]),
  qualification_reason: z.string().max(400),
  missing_fields: z.array(z.string().max(60)).max(10),
});
export type Notes = z.infer<typeof NotesSchema>;

/** Safe values for the leads table. A budget range is only kept if it is consistent. */
export function leadFields(n: Notes) {
  const ok = n.budget_min !== null && n.budget_max !== null && n.budget_max < n.budget_min;
  return {
    project_type: n.project_type, property_type: n.property_type, project_location: n.project_location,
    area_value: n.area_value, area_unit: n.area_value ? n.area_unit ?? "sqft" : null,
    budget_min: ok ? n.budget_max : n.budget_min, budget_max: ok ? n.budget_min : n.budget_max,
    timeline: n.timeline,
    requirements: [n.short_notes.length ? n.short_notes.map((b) => `- ${b}`).join("\n") : null, n.requirements].filter(Boolean).join("\n\n") || null,
    qualification_status: n.qualification,
  };
}

/** Fallback used when Gemini is unavailable or returns something unusable: keep VaaniVoice's own summary and flag for a human. */
export function fallbackNotes(summary: string | null): Notes {
  return {
    short_notes: summary ? [summary.slice(0, 220)] : [], customer_name: null, project_type: null, property_type: null, project_location: null,
    area_value: null, area_unit: null, budget_min: null, budget_max: null, timeline: null, requirements: null,
    customer_questions: [], follow_ups: [], qualification: "needs_review",
    qualification_reason: "Automatic notes were unavailable; a person should read the transcript.", missing_fields: ["all details"],
  };
}
