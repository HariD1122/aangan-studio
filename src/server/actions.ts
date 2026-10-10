"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { hashPassword, login, logout, requireRole, requireUser } from "./auth";
import { pool, withUser } from "./db";
import type { PoolClient } from "pg";
import { normalizePhone } from "@/lib/phone";

export type FormState = { error?: string; ok?: string } | undefined;

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optStr = z.preprocess(blank, z.string().trim().max(2000).optional());
const optNum = z.preprocess(blank, z.coerce.number().positive().optional());
const optDate = z.preprocess(blank, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional());
const first = (e: z.ZodError) => e.issues[0]?.message ?? "Invalid input";

async function audit(c: PoolClient, actor: string, action: string, entity: string, entityId: string | null, metadata: object = {}) {
  await c.query("insert into audit_logs(actor_id, action, entity, entity_id, metadata) values ($1,$2,$3,$4,$5)", [
    actor, action, entity, entityId, JSON.stringify(metadata),
  ]);
}

// ---------- auth ----------
export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const p = z.object({ email: z.string().email("Enter a valid email."), password: z.string().min(1, "Enter your password.") })
    .safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: first(p.error) };
  const r = await login(p.data.email, p.data.password);
  if (!r.ok) return { error: r.error };
  redirect("/dashboard");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}

// ---------- designers (admin) ----------
const designerSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the designer's full name.").max(120),
  email: z.preprocess(blank, z.string().email("Enter a valid work email.").optional()),
  phone: optStr,
  portfolioUrl: z.preprocess(blank, z.string().url("Portfolio link must be a full URL.").optional()),
  specializations: optStr,
  experienceYears: z.preprocess(blank, z.coerce.number().int().min(0).max(60).optional()),
  loginPassword: z.preprocess(blank, z.string().min(10, "Password must be at least 10 characters.").optional()),
});

export async function createDesignerAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireRole("admin");
  const p = designerSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: first(p.error) };
  const d = p.data;
  if (d.loginPassword && !d.email) return { error: "A work email is needed to create a login." };
  const specs = (d.specializations ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const c = await pool.connect(); // owner connection: creates a login user too, after the admin check above
  try {
    await c.query("begin");
    let userId: string | null = null;
    if (d.loginPassword && d.email) {
      const u = await c.query(
        "insert into users(email, password_hash, full_name, role) values ($1,$2,$3,'designer') returning id",
        [d.email, await hashPassword(d.loginPassword), d.fullName],
      );
      userId = u.rows[0].id;
    }
    const r = await c.query(
      `insert into designers(user_id, full_name, email, phone, portfolio_url, specializations, experience_years)
       values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [userId, d.fullName, d.email ?? null, d.phone ?? null, d.portfolioUrl ?? null, specs, d.experienceYears ?? null],
    );
    await audit(c, me.id, "designer.create", "designer", r.rows[0].id, { hasLogin: !!userId });
    await c.query("commit");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    if ((e as { code?: string }).code === "23505") return { error: "A user with that email already exists." };
    console.error("createDesigner failed", (e as Error).message);
    return { error: "Could not save the designer. Please try again." };
  } finally {
    c.release();
  }
  revalidatePath("/designers");
  return { ok: "Designer created." };
}

// ---------- clients ----------
const clientSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the client's name.").max(120),
  phone: z.string().trim().min(1, "Enter a phone number."),
  email: z.preprocess(blank, z.string().email("Enter a valid email.").optional()),
  projectType: optStr,
  projectLocation: optStr,
  propertyType: optStr,
  areaValue: optNum,
  areaUnit: z.preprocess(blank, z.enum(["sqft", "sqm"]).optional()),
  budgetMin: optNum,
  budgetMax: optNum,
  timeline: optStr,
  expectedStartDate: optDate,
  requirements: optStr,
  allowDuplicate: z.preprocess((v) => v === "on", z.boolean()),
});

export async function createClientAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireRole("admin", "front_desk");
  const p = clientSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: first(p.error) };
  const d = p.data;
  const phone = normalizePhone(d.phone);
  if (!phone) return { error: "Enter a valid phone number (10-digit Indian mobile or +country code)." };
  if (d.budgetMin && d.budgetMax && d.budgetMax < d.budgetMin) return { error: "Maximum budget cannot be below minimum budget." };
  if (d.areaValue && !d.areaUnit) return { error: "Choose an area unit (sq ft or sq m)." };

  let id: string;
  try {
    id = await withUser(me.id, async (c) => {
      if (!d.allowDuplicate) {
        const dup = await c.query("select id, full_name from clients where phone = $1 limit 1", [phone]);
        if (dup.rows[0]) throw new DuplicateError(dup.rows[0].full_name);
      }
      const r = await c.query(
        `insert into clients(full_name, phone, email, project_type, project_location, property_type, area_value, area_unit,
           budget_min, budget_max, timeline, expected_start_date, requirements, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
        [d.fullName, phone, d.email ?? null, d.projectType ?? null, d.projectLocation ?? null, d.propertyType ?? null,
         d.areaValue ?? null, d.areaUnit ?? null, d.budgetMin ?? null, d.budgetMax ?? null, d.timeline ?? null,
         d.expectedStartDate ?? null, d.requirements ?? null, me.id],
      );
      await audit(c, me.id, "client.create", "client", r.rows[0].id);
      return r.rows[0].id as string;
    });
  } catch (e) {
    if (e instanceof DuplicateError)
      return { error: `A client with this phone number already exists (${e.name}). Tick "Create anyway" if it is a different person.` };
    console.error("createClient failed", (e as Error).message);
    return { error: "Could not save the client. Please try again." };
  }
  revalidatePath("/clients");
  redirect(`/clients/${id}`);
}

class DuplicateError extends Error {
  constructor(public name: string) { super("duplicate"); }
}

// ---------- assignment ----------
export async function assignClientAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser();
  const p = z.object({ clientId: z.string().uuid(), designerId: z.string().uuid() }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Choose a designer." };
  try {
    await withUser(me.id, async (c) => {
      // RLS (app_can_assign) blocks users without permission; this check gives a friendly message.
      const can = await c.query("select app_can_assign() as ok");
      if (!can.rows[0].ok) throw new Error("forbidden");
      const des = await c.query("select id from designers where id = $1 and is_active", [p.data.designerId]);
      if (!des.rows[0]) throw new Error("designer_inactive");
      const prev = await c.query(
        "update designer_assignments set unassigned_at = now() where client_id = $1 and unassigned_at is null returning designer_id",
        [p.data.clientId],
      );
      await c.query("insert into designer_assignments(client_id, designer_id, assigned_by) values ($1,$2,$3)", [
        p.data.clientId, p.data.designerId, me.id,
      ]);
      await audit(c, me.id, prev.rows[0] ? "client.reassign" : "client.assign", "client", p.data.clientId, {
        designerId: p.data.designerId, previousDesignerId: prev.rows[0]?.designer_id ?? null,
      });
    });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "forbidden") return { error: "You don't have permission to assign clients." };
    if (m === "designer_inactive") return { error: "That designer is not active." };
    console.error("assign failed", m);
    return { error: "Could not assign the client. Please try again." };
  }
  revalidatePath(`/clients/${p.data.clientId}`);
  revalidatePath("/clients");
  revalidatePath("/designers");
  return { ok: "Designer assigned." };
}

// ---------- staff (admin) ----------
export async function createStaffAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireRole("admin");
  const p = z.object({
    fullName: z.string().trim().min(2, "Enter a name."),
    email: z.string().email("Enter a valid email."),
    password: z.string().min(10, "Password must be at least 10 characters."),
    role: z.enum(["front_desk", "viewer", "admin"]),
    canAssign: z.preprocess((v) => v === "on", z.boolean()),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: first(p.error) };
  const c = await pool.connect();
  try {
    await c.query("begin");
    const r = await c.query(
      "insert into users(email, password_hash, full_name, role, can_assign_leads) values ($1,$2,$3,$4,$5) returning id",
      [p.data.email, await hashPassword(p.data.password), p.data.fullName, p.data.role, p.data.canAssign],
    );
    await audit(c, me.id, "user.create", "user", r.rows[0].id, { role: p.data.role, canAssign: p.data.canAssign });
    await c.query("commit");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    if ((e as { code?: string }).code === "23505") return { error: "A user with that email already exists." };
    console.error("createStaff failed", (e as Error).message);
    return { error: "Could not create the user." };
  } finally {
    c.release();
  }
  revalidatePath("/staff");
  return { ok: "User created." };
}

export async function resetPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireRole("admin");
  const p = z.object({ userId: z.string().uuid(), password: z.string().min(10, "Password must be at least 10 characters.") })
    .safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: first(p.error) };
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("update users set password_hash = $2, failed_logins = 0, locked_until = null where id = $1", [
      p.data.userId, await hashPassword(p.data.password),
    ]);
    await c.query("delete from sessions where user_id = $1", [p.data.userId]);
    await audit(c, me.id, "user.password_reset", "user", p.data.userId);
    await c.query("commit");
  } catch {
    await c.query("rollback").catch(() => {});
    return { error: "Could not reset the password." };
  } finally {
    c.release();
  }
  return { ok: "Password reset. The user has been signed out everywhere." };
}
