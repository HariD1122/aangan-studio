import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processPending } from "@/server/hubspot";
import { processNotifications } from "@/server/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Safety-net worker: retries anything queued or failed. Protected by CRON_SECRET (Vercel Cron sends it as a Bearer token). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const ok = !!secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const hubspot = await processPending(25);
  const telegram = await processNotifications(10);
  return NextResponse.json({ ...hubspot, telegram });
}
