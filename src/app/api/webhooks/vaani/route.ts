import { timingSafeEqual } from "node:crypto";
import { NextResponse, after } from "next/server";
import { processCall, receiveWebhook } from "@/server/voice-ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 2_000_000;

/**
 * Receives VaaniVoice call events. VaaniVoice documents no request signature, so the endpoint is protected by a long secret
 * in the address (?key=...). Wrong or missing key -> 401. We answer 200 fast and finish the work after the response.
 */
export async function POST(req: Request) {
  const secret = process.env.VAANIVOICE_WEBHOOK_SECRET;
  const given = new URL(req.url).searchParams.get("key") ?? "";
  const ok = !!secret && secret.length >= 16 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await req.text();
  if (raw.length > MAX_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });

  const result = await receiveWebhook(raw);
  if (result.status === "bad_json") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  if (result.processId) {
    const id = result.processId;
    after(async () => { await processCall(id); });
  }
  return NextResponse.json({ ok: true, status: result.status });
}
