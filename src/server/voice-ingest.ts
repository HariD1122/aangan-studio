import "server-only";
import { createHash } from "node:crypto";
import { pool } from "./db";
import { getCallDetails } from "./vaani";
import { makeNotes } from "./notes";
import { processPending } from "./hubspot";
import { processNotifications } from "./telegram";
import { leadFields, parseWebhook, type ParsedEvent } from "@/lib/voice";
import { normalizePhone } from "@/lib/phone";

/**
 * Inbound call pipeline:
 *   VaaniVoice webhook -> store raw event (duplicates ignored) -> update the call record
 *   -> on `call_postprocessing`: Gemini short notes -> create (or find) the lead -> HubSpot sync + Telegram alert (via the queues).
 */
const OUTBOUND_ONLY_EVENTS = new Set(["call_ringing", "call_rejected", "call_no_answer"]);

export type ReceiveResult = { status: "stored" | "duplicate" | "ignored" | "bad_json"; processId?: string };

export async function receiveWebhook(raw: string): Promise<ReceiveResult> {
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return { status: "bad_json" }; }
  const p = parseWebhook(body);
  if (!p.event || (!p.callId && !p.roomName)) return { status: "ignored" };

  const hash = createHash("sha256").update(raw).digest("hex");
  const ev = await pool.query(
    `insert into voice_call_events(payload_hash, event, provider_call_id, room_name, payload) values ($1,$2,$3,$4,$5)
     on conflict (payload_hash) do nothing returning id`,
    [hash, p.event, p.callId, p.roomName, JSON.stringify(body)],
  );
  if (!ev.rowCount) return { status: "duplicate" };

  const id = await upsertCall(p);
  return { status: "stored", processId: p.event === "call_postprocessing" ? id : undefined };
}

async function upsertCall(p: ParsedEvent): Promise<string> {
  const newStatus = p.event === "call_postprocessing" ? "processing" : p.event === "call_started" ? "started" : "ended";
  const params = [
    p.callId, p.roomName, p.phone, newStatus, p.durationSeconds, p.endReason, p.summary, p.transcript,
    p.entities === null ? null : JSON.stringify(p.entities), p.dispositions === null ? null : JSON.stringify(p.dispositions), p.recordingUrl,
  ];
  const update = `
    update voice_calls set
      provider_call_id = coalesce(provider_call_id, $1), room_name = coalesce(room_name, $2), phone = coalesce(phone, $3),
      status = case when $4 = 'processing' and status <> 'done' then 'processing'
                    when status in ('processing','done','needs_review','failed') then status else $4 end,
      duration_seconds = coalesce($5, duration_seconds), end_reason = coalesce($6, end_reason),
      provider_summary = coalesce($7, provider_summary), transcript = coalesce($8, transcript),
      entities = coalesce($9::jsonb, entities), dispositions = coalesce($10::jsonb, dispositions), recording_url = coalesce($11, recording_url)
    where (provider_call_id is not null and provider_call_id = $1) or (room_name is not null and room_name = $2)
    returning id`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const u = await pool.query(update, params);
    if (u.rows[0]) return u.rows[0].id;
    try {
      const direction = p.event && OUTBOUND_ONLY_EVENTS.has(p.event) ? "outbound" : "inbound";
      const ins = await pool.query(
        `insert into voice_calls(provider_call_id, room_name, phone, status, duration_seconds, end_reason, provider_summary, transcript, entities, dispositions, recording_url, direction)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12) returning id`,
        [...params, direction],
      );
      return ins.rows[0].id;
    } catch (e) {
      if ((e as { code?: string }).code !== "23505") throw e; // two events raced to create the row: loop and update it
    }
  }
  throw new Error("Could not record the call.");
}

type CallRow = { id: string; provider_call_id: string | null; phone: string | null; customer_name: string | null; transcript: string | null;
  provider_summary: string | null; entities: unknown; status: string };

export async function processCall(id: string): Promise<{ ok: boolean; clientId?: string; reason?: string }> {
  const claimed = await pool.query("update voice_calls set attempts = attempts + 1, status = 'processing' where id = $1 and status <> 'done' returning *", [id]);
  const row = claimed.rows[0] as CallRow | undefined;
  if (!row) return { ok: true }; // already finished (for example a duplicate delivery)
  try {
    let { transcript, provider_summary: summary, entities } = row;
    if (!transcript && row.provider_call_id) {
      const d = await getCallDetails(row.provider_call_id); // the webhook sometimes omits the transcript
      if (d) { transcript = d.transcript; summary = summary ?? d.summary; entities = entities ?? d.entities; }
    }
    if (!transcript && !summary) {
      await pool.query("update voice_calls set status = 'needs_review', error = 'No transcript or summary was received for this call.' where id = $1", [id]);
      return { ok: false, reason: "no transcript" };
    }

    const { notes, usedFallback } = await makeNotes({ transcript, summary, entities });
    const phone = row.phone ? normalizePhone(row.phone) : null;
    if (!phone) {
      await pool.query("update voice_calls set status = 'needs_review', notes = $2, transcript = coalesce(transcript, $3), error = $4 where id = $1",
        [id, JSON.stringify(notes), transcript, "No usable caller phone number was received, so no lead was created. Review this call by hand."]);
      return { ok: false, reason: "no phone" };
    }

    const isSample = (row.provider_call_id ?? "").startsWith("sample-");
    let clientId = (await pool.query("select id from clients where phone = $1 limit 1", [phone])).rows[0]?.id as string | undefined;
    let created = false;
    if (!clientId) {
      const f = leadFields(notes);
      const name = notes.customer_name ?? row.customer_name ?? `Caller ${phone.slice(-4)}`;
      clientId = (await pool.query(
        `insert into clients(full_name, phone, preferred_contact, project_type, property_type, project_location, area_value, area_unit,
           budget_min, budget_max, timeline, requirements, qualification_status, source, is_demo)
         values ($1,$2,'phone',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
        [name, phone, f.project_type, f.property_type, f.project_location, f.area_value, f.area_unit, f.budget_min, f.budget_max,
         f.timeline, f.requirements, f.qualification_status, isSample ? "Sample call (test)" : "Phone call (VaaniVoice)", isSample],
      )).rows[0].id;
      created = true;
      // Demo leads never alert by design, but a sample call is a test run: send its alert too (the message says 'Sample call (test)').
      if (isSample) await pool.query("insert into notification_queue(kind, client_id) values ('new_lead', $1) on conflict do nothing", [clientId]);
    }
    await pool.query("update voice_calls set status = 'done', client_id = $2, notes = $3, transcript = coalesce(transcript, $4), error = $5 where id = $1",
      [id, clientId, JSON.stringify(notes), transcript, usedFallback ? "Gemini was unavailable; a person should review the transcript." : null]);
    await pool.query("insert into audit_logs(action, entity, entity_id, metadata) values ($1,'client',$2,$3)",
      [created ? "call.lead_created" : "call.attached_to_existing_lead", clientId, JSON.stringify({ voiceCallId: id, usedFallback })]);

    // The database trigger has already queued the HubSpot sync and the Telegram alert. Send them now (the daily check is the safety net).
    try { await processPending(3); } catch (e) { console.error("hubspot after call failed", (e as Error).message); }
    try { await processNotifications(3); } catch (e) { console.error("telegram after call failed", (e as Error).message); }
    return { ok: true, clientId };
  } catch (e) {
    console.error("processCall failed", (e as Error).message);
    await pool.query("update voice_calls set status = 'failed', error = $2 where id = $1", [id, "Processing failed; it will be retried automatically."]);
    return { ok: false, reason: "error" };
  }
}

/** Safety net (called by the daily check and the Integrations page): re-runs calls that got stuck or failed. */
export async function retryStuckCalls(limit = 3): Promise<number> {
  const stuck = await pool.query(
    `select id from voice_calls where status in ('processing','failed') and attempts < 5 and updated_at < now() - interval '2 minutes'
      order by updated_at limit $1`, [limit]);
  for (const r of stuck.rows) await processCall(r.id);
  return stuck.rowCount ?? 0;
}
