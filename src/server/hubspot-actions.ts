"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "./auth";
import { pool } from "./db";
import { getStages, processPending, setupHubSpotFields, syncClient } from "./hubspot";
import type { FormState } from "./actions";

const refresh = () => { revalidatePath("/settings"); revalidatePath("/clients"); };
const msg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

async function audit(actor: string, action: string, metadata: object = {}) {
  await pool.query("insert into audit_logs(actor_id, action, entity, metadata) values ($1,$2,'hubspot',$3)", [actor, action, JSON.stringify(metadata)]);
}

export async function setupFieldsAction(): Promise<FormState> {
  const me = await requireRole("admin");
  try {
    const r = await setupHubSpotFields();
    await audit(me.id, "hubspot.setup_fields", r);
    refresh();
    return { ok: `HubSpot fields are ready (${r.created} created, ${r.existing} already there).` };
  } catch (e) {
    return { error: msg(e) };
  }
}

export async function syncNowAction(): Promise<FormState> {
  const me = await requireRole("admin");
  try {
    const r = await processPending(25);
    await audit(me.id, "hubspot.sync_now", r);
    refresh();
    return r.synced + r.failed === 0
      ? { ok: "Nothing is waiting to sync." }
      : r.failed ? { error: `${r.synced} synced, ${r.failed} failed. See the list below for the reason.` } : { ok: `${r.synced} client(s) synced to HubSpot.` };
  } catch (e) {
    return { error: msg(e) };
  }
}

export async function resyncAllAction(): Promise<FormState> {
  const me = await requireRole("admin");
  try {
    const q = await pool.query(
      `insert into hubspot_sync(client_id) select id from clients
       on conflict (client_id) do update set status = 'pending', queued_at = now(), next_attempt_at = now(), attempts = 0, last_error = null`);
    await audit(me.id, "hubspot.resync_all", { clients: q.rowCount });
    refresh();
    return { ok: `${q.rowCount} client(s) queued. Press "Sync now" to send them.` };
  } catch (e) {
    return { error: msg(e) };
  }
}

export async function retryClientAction(fd: FormData): Promise<void> {
  const me = await requireRole("admin");
  const p = z.object({ id: z.string().uuid() }).safeParse(Object.fromEntries(fd));
  if (!p.success) return;
  await pool.query("update hubspot_sync set next_attempt_at = now(), attempts = 0 where client_id = $1", [p.data.id]);
  const r = await syncClient(p.data.id);
  await audit(me.id, "hubspot.retry", { clientId: p.data.id, ok: r.ok });
  refresh();
}

export async function setNewDealStageAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireRole("admin");
  const p = z.object({ stage: z.string().min(1) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Choose a stage." };
  try {
    const stage = (await getStages()).find((s) => s.id === p.data.stage);
    if (!stage || stage.closed) return { error: "Pick an open (not won/lost) stage." };
    await pool.query(
      "insert into studio_settings(key, value) values ('hubspot.new_deal_stage', to_jsonb($1::text)) on conflict (key) do update set value = excluded.value, updated_at = now()",
      [stage.id],
    );
    await audit(me.id, "hubspot.set_new_deal_stage", { stage: stage.label });
    refresh();
    return { ok: `New deals will start at "${stage.label}".` };
  } catch (e) {
    return { error: msg(e) };
  }
}
