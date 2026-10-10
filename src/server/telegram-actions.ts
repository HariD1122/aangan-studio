"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "./auth";
import { pool } from "./db";
import { processNotifications, sendToGroup, telegramConfigured } from "./telegram";
import type { FormState } from "./actions";

const msg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

export async function telegramTestAction(): Promise<FormState> {
  const me = await requireRole("admin");
  if (!telegramConfigured()) return { error: "Telegram is not fully configured yet (bot token and group chat ID)." };
  try {
    await sendToGroup("✅ <b>Aangan Studio</b> is connected. New leads will be posted here. (Test message sent from the Integrations page.)");
    await pool.query("insert into audit_logs(actor_id, action, entity, metadata) values ($1,'telegram.test','telegram','{}')", [me.id]);
    return { ok: "Test message sent. Check the Telegram group." };
  } catch (e) {
    return { error: msg(e) };
  }
}

export async function telegramSendPendingAction(): Promise<FormState> {
  await requireRole("admin");
  try {
    const r = await processNotifications(10);
    revalidatePath("/settings");
    if (r.sent + r.failed === 0) return { ok: "No lead alerts are waiting." };
    return r.failed ? { error: `${r.sent} sent, ${r.failed} failed. See the reason below.` } : { ok: `${r.sent} lead alert(s) sent.` };
  } catch (e) {
    return { error: msg(e) };
  }
}
