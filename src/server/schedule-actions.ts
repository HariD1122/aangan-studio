"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { PoolClient } from "pg";
import { requireRole } from "./auth";
import { withUser } from "./db";
import { parseIstLocal, istDateTime } from "@/lib/time";
import type { FormState } from "./actions";

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optStr = z.preprocess(blank, z.string().trim().max(2000).optional());
const optUuid = z.preprocess(blank, z.string().uuid().optional());
const first = (e: z.ZodError) => e.issues[0]?.message ?? "Invalid input";

async function audit(c: PoolClient, actor: string, action: string, entity: string, id: string, metadata: object = {}) {
  await c.query("insert into audit_logs(actor_id, action, entity, entity_id, metadata) values ($1,$2,$3,$4,$5)", [actor, action, entity, id, JSON.stringify(metadata)]);
}

function refreshAll() {
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
}

/** A designer can only answer if they have a login linked to their profile. */
async function designerCanRespond(c: PoolClient, designerId: string): Promise<string | null> {
  const r = await c.query("select full_name, is_active, user_id from designers where id = $1", [designerId]);
  const d = r.rows[0];
  if (!d) return "Choose a designer.";
  if (!d.is_active) return `${d.full_name} is not active.`;
  if (!d.user_id) return `${d.full_name} has no login yet, so they cannot accept or reject. Give them a login first.`;
  return null;
}

// ---------- admin: request a meeting ----------
export async function requestMeetingAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireRole("admin");
  const p = z.object({
    designerId: z.string().uuid("Choose a designer."),
    clientId: optUuid,
    title: z.string().trim().min(3, "Give the meeting a title (at least 3 characters).").max(160),
    startsAt: z.string(),
    durationMin: z.coerce.number().int().min(15).max(480),
    location: optStr,
    description: optStr,
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: first(p.error) };
  const d = p.data;
  const start = parseIstLocal(d.startsAt);
  if (!start) return { error: "Choose a start date and time." };
  if (start.getTime() < Date.now()) return { error: "The meeting start time is in the past." };
  const end = new Date(start.getTime() + d.durationMin * 60_000);

  try {
    await withUser(me.id, async (c) => {
      const blocked = await designerCanRespond(c, d.designerId);
      if (blocked) throw new Friendly(blocked);
      const clash = await c.query(
        `select title, starts_at from meetings where designer_id = $1 and status = 'accepted'
           and tstzrange(starts_at, ends_at) && tstzrange($2::timestamptz, $3::timestamptz) limit 1`,
        [d.designerId, start, end],
      );
      if (clash.rows[0]) throw new Friendly(`That time clashes with an accepted meeting ("${clash.rows[0].title}", ${istDateTime(clash.rows[0].starts_at)}). Pick another time.`);
      const r = await c.query(
        `insert into meetings(designer_id, client_id, title, description, location, starts_at, ends_at, requested_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
        [d.designerId, d.clientId ?? null, d.title, d.description ?? null, d.location ?? null, start, end, me.id],
      );
      await audit(c, me.id, "meeting.request", "meeting", r.rows[0].id, { designerId: d.designerId, startsAt: start.toISOString() });
    });
  } catch (e) {
    if (e instanceof Friendly) return { error: e.message };
    console.error("requestMeeting failed", (e as Error).message);
    return { error: "Could not send the meeting request. Please try again." };
  }
  refreshAll();
  return { ok: "Meeting requested. It will appear on calendars once the designer accepts it." };
}

// ---------- admin: assign a task ----------
export async function assignTaskAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireRole("admin");
  const p = z.object({
    designerId: z.string().uuid("Choose a designer."),
    clientId: optUuid,
    title: z.string().trim().min(3, "Give the task a title (at least 3 characters).").max(160),
    description: optStr,
    dueDate: z.preprocess(blank, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid due date.").optional()),
    priority: z.enum(["low", "normal", "high"]),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: first(p.error) };
  const d = p.data;
  try {
    await withUser(me.id, async (c) => {
      const blocked = await designerCanRespond(c, d.designerId);
      if (blocked) throw new Friendly(blocked);
      const r = await c.query(
        "insert into tasks(designer_id, client_id, title, description, due_date, priority, assigned_by) values ($1,$2,$3,$4,$5,$6,$7) returning id",
        [d.designerId, d.clientId ?? null, d.title, d.description ?? null, d.dueDate ?? null, d.priority, me.id],
      );
      await audit(c, me.id, "task.assign", "task", r.rows[0].id, { designerId: d.designerId });
    });
  } catch (e) {
    if (e instanceof Friendly) return { error: e.message };
    console.error("assignTask failed", (e as Error).message);
    return { error: "Could not assign the task. Please try again." };
  }
  refreshAll();
  return { ok: "Task assigned. The designer will see it on their dashboard." };
}

// ---------- designer: accept / reject ----------
const respondSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["accept", "reject"]),
  reason: z.preprocess(blank, z.string().trim().min(3, "Please give a reason (at least 3 characters).").max(1000).optional()),
});

export async function respondMeetingAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireRole("designer");
  const p = respondSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: first(p.error) };
  const { id, decision, reason } = p.data;
  if (decision === "reject" && !reason) return { error: "Please give a reason for rejecting." };
  try {
    await withUser(me.id, async (c) => {
      const r = await c.query(
        `update meetings set status = $2, rejection_reason = $3, responded_at = now()
          where id = $1 and status = 'requested' returning id`,
        [id, decision === "accept" ? "accepted" : "rejected", decision === "reject" ? reason : null],
      );
      if (!r.rows[0]) throw new Friendly("This request was already answered, withdrawn, or is not yours.");
      await audit(c, me.id, decision === "accept" ? "meeting.accept" : "meeting.reject", "meeting", id, decision === "reject" ? { reason } : {});
    });
  } catch (e) {
    if (e instanceof Friendly) return { error: e.message };
    if ((e as { code?: string }).code === "23P01")
      return { error: "You already have an accepted meeting at that time, so it can't be accepted. Reject it with a reason, or ask the admin to pick another time." };
    console.error("respondMeeting failed", (e as Error).message);
    return { error: "Could not save your answer. Please try again." };
  }
  refreshAll();
  return { ok: decision === "accept" ? "Meeting accepted and added to your calendar." : "Meeting rejected. The admin can see your reason." };
}

export async function respondTaskAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireRole("designer");
  const p = respondSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: first(p.error) };
  const { id, decision, reason } = p.data;
  if (decision === "reject" && !reason) return { error: "Please give a reason for rejecting." };
  try {
    await withUser(me.id, async (c) => {
      const r = await c.query(
        `update tasks set status = $2, rejection_reason = $3, responded_at = now()
          where id = $1 and status = 'assigned' returning id`,
        [id, decision === "accept" ? "accepted" : "rejected", decision === "reject" ? reason : null],
      );
      if (!r.rows[0]) throw new Friendly("This task was already answered, withdrawn, or is not yours.");
      await audit(c, me.id, decision === "accept" ? "task.accept" : "task.reject", "task", id, decision === "reject" ? { reason } : {});
    });
  } catch (e) {
    if (e instanceof Friendly) return { error: e.message };
    console.error("respondTask failed", (e as Error).message);
    return { error: "Could not save your answer. Please try again." };
  }
  refreshAll();
  return { ok: decision === "accept" ? "Task accepted." : "Task rejected. The admin can see your reason." };
}

// ---------- small void actions used by plain forms ----------
const idOnly = z.object({ id: z.string().uuid() });

export async function completeTaskAction(fd: FormData): Promise<void> {
  const me = await requireRole("designer");
  const p = idOnly.safeParse(Object.fromEntries(fd));
  if (!p.success) return;
  await withUser(me.id, async (c) => {
    const r = await c.query("update tasks set status = 'completed', completed_at = now() where id = $1 and status = 'accepted' returning id", [p.data.id]);
    if (r.rows[0]) await audit(c, me.id, "task.complete", "task", p.data.id);
  });
  refreshAll();
}

export async function withdrawAction(fd: FormData): Promise<void> {
  const me = await requireRole("admin");
  const p = z.object({ id: z.string().uuid(), kind: z.enum(["meeting", "task"]) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return;
  await withUser(me.id, async (c) => {
    const sql = p.data.kind === "meeting"
      ? "update meetings set status = 'cancelled' where id = $1 and status = 'requested' returning id"
      : "update tasks set status = 'cancelled' where id = $1 and status = 'assigned' returning id";
    const r = await c.query(sql, [p.data.id]);
    if (r.rows[0]) await audit(c, me.id, `${p.data.kind}.withdraw`, p.data.kind, p.data.id);
  });
  refreshAll();
}

export async function acknowledgeAction(fd: FormData): Promise<void> {
  const me = await requireRole("admin");
  const p = z.object({ id: z.string().uuid(), kind: z.enum(["meeting", "task"]) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return;
  await withUser(me.id, async (c) => {
    await c.query(`update ${p.data.kind === "meeting" ? "meetings" : "tasks"} set acknowledged_at = now() where id = $1 and acknowledged_at is null`, [p.data.id]);
  });
  refreshAll();
}

class Friendly extends Error {}
