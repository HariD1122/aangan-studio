"use server";
import { revalidatePath } from "next/cache";
import { randomInt } from "node:crypto";
import { requireRole } from "./auth";
import { pool } from "./db";
import { processCall, receiveWebhook } from "./voice-ingest";
import type { FormState } from "./actions";

const SAMPLE_TRANSCRIPT = `AGENT: Namaste, thank you for calling Aangan Studio. How can I help you today?
USER: Hi, my name is Anjali Deshpande. I have a 3BHK flat in Baner, about 1,150 square feet carpet. We want to redo the whole house: kitchen, wardrobes, living room and both bedrooms.
AGENT: That sounds like a complete redesign with execution. When would you like it finished?
USER: We would like to move back in by March. We just got possession of the flat.
AGENT: Lovely. Are you the owner of the flat?
USER: Yes, my husband and I together. He is happy for us to go ahead.
AGENT: Do you have a budget in mind?
USER: Around 25 lakh I think, but we are open to discussion. Can you tell me roughly what a 3BHK costs per square foot?
AGENT: Pricing depends on the site and the materials you choose, so your designer will walk you through it at the consultation. Shall I book that for you?
USER: Yes please, weekdays after 6 pm would suit us.`;

/** Runs a made-up call through the REAL pipeline (webhook handling, Gemini notes, lead, HubSpot, queues). The lead is marked DEMO. */
export async function runSampleCallAction(): Promise<FormState> {
  const me = await requireRole("admin");
  const callId = `sample-${Date.now()}`;
  const room = `room-${callId}`;
  const phone = `+9190000${String(randomInt(0, 100000)).padStart(5, "0")}`;
  try {
    await receiveWebhook(JSON.stringify({ event: "call_started", room_name: room, status: "dialing", phone_number: phone }));
    await receiveWebhook(JSON.stringify({ event: "call_ended", room_name: room, call_duration: 74.2, end_reason: "user_hangup" }));
    const r = await receiveWebhook(JSON.stringify({
      event: "call_postprocessing", call_id: callId, timestamp: new Date().toISOString(),
      data: { room_name: room, call_id: callId, call_duration: 74200, end_reason: "user_hangup", summary: "Caller wants a full 3BHK redesign in Baner by March.",
        entities: {}, dispositions: ["interested"], recording_url: null, transcript: SAMPLE_TRANSCRIPT },
    }));
    if (!r.processId) return { error: "The sample call was not recorded." };
    const out = await processCall(r.processId);
    await pool.query("insert into audit_logs(actor_id, action, entity, metadata) values ($1,'voice.sample_call','voice_call',$2)", [me.id, JSON.stringify({ callId })]);
    revalidatePath("/settings"); revalidatePath("/clients"); revalidatePath("/dashboard");
    return out.ok ? { ok: "Sample call processed. A new DEMO lead was created, with short notes, and queued for HubSpot." } : { error: `The sample call needs review (${out.reason}).` };
  } catch (e) {
    console.error("sample call failed", (e as Error).message);
    return { error: "The sample call failed. See the server log." };
  }
}
