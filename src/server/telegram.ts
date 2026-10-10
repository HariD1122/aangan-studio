import "server-only";
import { after } from "next/server";
import { pool } from "./db";
import { leadMessage, type LeadForMessage } from "@/lib/lead-message";

/**
 * Posts "new lead" alerts to the team's Telegram group through the bot.
 * Reliable by design: a database trigger queues each new real lead, this worker sends it and retries on failure.
 * The bot token is only ever used in the request URL and is never logged or put into an error message.
 */
const MAX_ATTEMPTS = 10;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const appUrl = () => process.env.APP_URL ?? "https://aangan-studio-azure.vercel.app";

export class TelegramError extends Error {
  constructor(message: string, public retryAfter?: number) {
    super(message);
  }
}

export const telegramConfigured = () => Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);

function friendly(status: number, description: string | undefined): string {
  const d = (description ?? "").toLowerCase();
  if (status === 401) return "Telegram rejected the bot token.";
  if (d.includes("chat not found")) return "Telegram cannot find the group. Check the chat ID and that the bot is still in the group.";
  if (d.includes("kicked") || d.includes("not a member")) return "The bot was removed from the group. Add it back.";
  if (d.includes("not enough rights") || d.includes("have no rights")) return "The bot is not allowed to post in the group. Give it permission to send messages.";
  if (status === 429) return "Telegram rate limit reached; will retry.";
  if (status >= 500) return "Telegram is temporarily unavailable; will retry.";
  return `Telegram rejected the message (${status}).`;
}

async function call(method: string, body?: unknown) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramError("Telegram bot token is not configured.");
  let res: Response;
  try {
    res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new TelegramError("Telegram did not respond (network problem or timeout).");
  }
  const json = (await res.json().catch(() => null)) as { ok?: boolean; description?: string; result?: unknown; parameters?: { retry_after?: number } } | null;
  if (!res.ok || !json?.ok) throw new TelegramError(friendly(res.status, json?.description), json?.parameters?.retry_after);
  return json.result;
}

export async function sendToGroup(html: string) {
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!chat) throw new TelegramError("Telegram group (chat ID) is not configured yet.");
  await call("sendMessage", { chat_id: chat, text: html, parse_mode: "HTML", disable_web_page_preview: true });
}

export async function telegramHealth(): Promise<{ botName?: string; groupName?: string; error?: string; chatConfigured: boolean }> {
  const out: { botName?: string; groupName?: string; error?: string; chatConfigured: boolean } = { chatConfigured: Boolean(process.env.TELEGRAM_CHAT_ID) };
  try {
    const me = (await call("getMe")) as { username?: string };
    out.botName = me.username ? `@${me.username}` : "bot";
    if (process.env.TELEGRAM_CHAT_ID) {
      const chat = (await call("getChat", { chat_id: process.env.TELEGRAM_CHAT_ID })) as { title?: string };
      out.groupName = chat.title ?? "group";
    }
  } catch (e) {
    out.error = (e as Error).message;
  }
  return out;
}

const LOAD = `select id, full_name, project_type, project_location, property_type, area_value, area_unit, budget_min, budget_max,
                     timeline, source, qualification_status from clients where id = $1`;

async function deliver(queueId: string, clientId: string): Promise<boolean> {
  try {
    const lead = (await pool.query(LOAD, [clientId])).rows[0] as LeadForMessage | undefined;
    if (lead) await sendToGroup(leadMessage(lead, appUrl()));
    await pool.query("update notification_queue set status = 'sent', sent_at = now(), last_error = null where id = $1", [queueId]);
    return true;
  } catch (e) {
    const err = e instanceof TelegramError ? e : new TelegramError("Unexpected error while sending.");
    if (!(e instanceof TelegramError)) console.error("telegram delivery failed", (e as Error).message);
    await pool.query(
      `update notification_queue set status = 'failed', attempts = attempts + 1, last_error = $2,
              next_attempt_at = now() + make_interval(secs => greatest($3::int, least(3600, 60 * power(2, least(attempts, 6))::int))) where id = $1`,
      [queueId, err.message, err.retryAfter ?? 0],
    );
    return false;
  }
}

/** Claims due alerts (so two workers never send the same one), then sends them one by one. */
export async function processNotifications(limit = 10): Promise<{ sent: number; failed: number }> {
  if (!telegramConfigured()) return { sent: 0, failed: 0 };
  const claimed = await pool.query(
    `update notification_queue set next_attempt_at = now() + interval '3 minutes'
      where id in (select id from notification_queue where status in ('pending','failed') and attempts < $2 and next_attempt_at <= now()
                    order by created_at limit $1 for update skip locked)
      returning id, client_id`,
    [limit, MAX_ATTEMPTS],
  );
  let sent = 0, failed = 0;
  for (const row of claimed.rows) {
    if (await deliver(row.id, row.client_id)) sent++; else failed++;
    await sleep(1200); // Telegram allows ~20 messages a minute to one group
  }
  return { sent, failed };
}

/** Call from a server action or webhook: sends queued alerts right after the response goes out. */
export function kickNotifications() {
  if (!telegramConfigured()) return;
  after(async () => {
    try { await processNotifications(5); } catch (e) { console.error("kickNotifications failed", (e as Error).message); }
  });
}
