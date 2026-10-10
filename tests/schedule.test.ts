import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

// Runs inside a transaction that is rolled back: nothing stays in the database.
let c: pg.Client;
const ids: Record<string, string> = {};

async function as(userId: string | null) {
  await c.query("reset role");
  if (userId) {
    await c.query("set local role app_user");
    await c.query("select set_config('app.user_id', $1, true)", [userId]);
  }
}
async function expectFail(sql: string, params: unknown[], match?: RegExp) {
  await c.query("savepoint s");
  const p = expect(c.query(sql, params)).rejects;
  await (match ? p.toThrow(match) : p.toThrow());
  await c.query("rollback to savepoint s");
}
async function newMeeting(designer: string, start: string, end: string, status = "requested") {
  const r = await c.query(
    "insert into meetings(designer_id, title, starts_at, ends_at, status, requested_by) values ($1,'Site visit',$2,$3,$4,$5) returning id",
    [ids[designer], start, end, status, ids.admin],
  );
  return r.rows[0].id as string;
}

beforeAll(async () => {
  c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query("begin");
  for (const [key, role] of [["admin", "admin"], ["desA", "designer"], ["desB", "designer"], ["desk", "front_desk"]]) {
    const r = await c.query("insert into users(email, password_hash, full_name, role) values ($1,'x',$2,$3) returning id", [`${key}-${Date.now()}@test.local`, key, role]);
    ids[key] = r.rows[0].id;
  }
  for (const k of ["A", "B"]) {
    const d = await c.query("insert into designers(user_id, full_name) values ($1,$2) returning id", [ids["des" + k], "Designer " + k]);
    ids["designer" + k] = d.rows[0].id;
  }
  ids.designerA = ids.designerA;
});
afterAll(async () => {
  await c.query("rollback");
  await c.end();
});



const T1 = "2030-01-10 10:00+05:30", T1E = "2030-01-10 11:00+05:30";

describe("meeting requests", () => {
  it("only admin can request a meeting", async () => {
    await as(ids.desk);
    await expectFail("insert into meetings(designer_id,title,starts_at,ends_at,requested_by) values ($1,'x y z',$2,$3,$4)", [ids.designerA, T1, T1E, ids.desk]);
    await as(ids.desA);
    await expectFail("insert into meetings(designer_id,title,starts_at,ends_at,requested_by) values ($1,'x y z',$2,$3,$4)", [ids.designerA, T1, T1E, ids.desA]);
    await as(ids.admin);
    await c.query("insert into meetings(designer_id,title,starts_at,ends_at,requested_by) values ($1,'Kickoff',$2,$3,$4)", [ids.designerA, T1, T1E, ids.admin]);
  });
  it("a designer sees only their own meetings", async () => {
    await as(ids.admin);
    await newMeeting("designerB", T1, T1E);
    await as(ids.desA);
    const mine = await c.query("select designer_id from meetings");
    expect(mine.rows.every((r) => r.designer_id === ids.designerA)).toBe(true);
    await as(ids.desk);
    expect((await c.query("select 1 from meetings")).rowCount).toBe(0);
  });
  it("designer can accept, and details cannot be changed", async () => {
    await as(ids.admin);
    const id = await newMeeting("designerA", "2030-02-01 09:00+05:30", "2030-02-01 10:00+05:30");
    await as(ids.desA);
    await expectFail("update meetings set starts_at = starts_at + interval '1 day', status='accepted' where id=$1", [id], /cannot edit meeting details/);
    expect((await c.query("update meetings set status='accepted', responded_at=now() where id=$1", [id])).rowCount).toBe(1);
  });
  it("rejection requires a reason", async () => {
    await as(ids.admin);
    const id = await newMeeting("designerA", "2030-03-01 09:00+05:30", "2030-03-01 10:00+05:30");
    await as(ids.desA);
    await expectFail("update meetings set status='rejected' where id=$1", [id], /meetings_check|check constraint/);
    await c.query("update meetings set status='rejected', rejection_reason='Out of town that week' where id=$1", [id]);
    await as(ids.admin);
    const r = await c.query("select status, rejection_reason from meetings where id=$1", [id]);
    expect(r.rows[0]).toEqual({ status: "rejected", rejection_reason: "Out of town that week" });
  });
  it("another designer cannot answer someone else's request", async () => {
    await as(ids.admin);
    const id = await newMeeting("designerA", "2030-04-01 09:00+05:30", "2030-04-01 10:00+05:30");
    await as(ids.desB);
    expect((await c.query("update meetings set status='accepted' where id=$1", [id])).rowCount).toBe(0);
  });
  it("a designer cannot answer twice or reopen a rejected meeting", async () => {
    await as(ids.admin);
    const id = await newMeeting("designerA", "2030-05-01 09:00+05:30", "2030-05-01 10:00+05:30");
    await as(ids.desA);
    await c.query("update meetings set status='accepted' where id=$1", [id]);
    await expectFail("update meetings set status='rejected', rejection_reason='changed my mind' where id=$1", [id], /only accept or reject a requested/);
  });
});

// Each test uses its own day so earlier tests in the shared transaction cannot interfere.
const slot = (day: number, from = "10:00", to = "11:00") => [`2031-03-${String(day).padStart(2, "0")} ${from}+05:30`, `2031-03-${String(day).padStart(2, "0")} ${to}+05:30`] as const;

describe("double-booking protection", () => {
  it("two accepted meetings cannot overlap for the same designer", async () => {
    await as(ids.admin);
    const [s1, e1] = slot(1), [s2, e2] = slot(1, "10:30", "11:30");
    await newMeeting("designerA", s1, e1, "accepted");
    await expectFail("insert into meetings(designer_id,title,starts_at,ends_at,status,requested_by) values ($1,'Clash',$2,$3,'accepted',$4)",
      [ids.designerA, s2, e2, ids.admin], /meetings_no_overlap/);
  });
  it("accepting a request that clashes is refused", async () => {
    await as(ids.admin);
    const [s1, e1] = slot(2), [s2, e2] = slot(2, "10:30", "11:30");
    await newMeeting("designerA", s1, e1, "accepted");
    const pending = await newMeeting("designerA", s2, e2);
    await as(ids.desA);
    await expectFail("update meetings set status='accepted' where id=$1", [pending], /meetings_no_overlap/);
  });
  it("pending requests do not reserve time, and other designers are unaffected", async () => {
    await as(ids.admin);
    const [s1, e1] = slot(3), [s2, e2] = slot(3, "10:30", "11:30");
    await newMeeting("designerA", s1, e1, "requested");
    await newMeeting("designerA", s2, e2, "requested");
    await newMeeting("designerB", s1, e1, "accepted");
    await newMeeting("designerA", s1, e1, "accepted");
  });
  it("back-to-back meetings are allowed", async () => {
    await as(ids.admin);
    const [s1, e1] = slot(4), [s2, e2] = slot(4, "11:00", "12:00");
    await newMeeting("designerA", s1, e1, "accepted");
    await newMeeting("designerA", s2, e2, "accepted");
  });
});

describe("tasks", () => {
  async function newTask(designer: string) {
    const r = await c.query("insert into tasks(designer_id,title,assigned_by) values ($1,'Prepare moodboard',$2) returning id", [ids[designer], ids.admin]);
    return r.rows[0].id as string;
  }
  it("designer sees only their tasks and cannot create tasks", async () => {
    await as(ids.admin);
    await newTask("designerA");
    await newTask("designerB");
    await as(ids.desA);
    const r = await c.query("select designer_id from tasks");
    expect(r.rows.every((x) => x.designer_id === ids.designerA)).toBe(true);
    await expectFail("insert into tasks(designer_id,title,assigned_by) values ($1,'Self assigned',$2)", [ids.designerA, ids.desA]);
  });
  it("accept then complete; cannot skip straight to completed", async () => {
    await as(ids.admin);
    const id = await newTask("designerA");
    await as(ids.desA);
    await expectFail("update tasks set status='completed' where id=$1", [id], /only accept\/reject/);
    await c.query("update tasks set status='accepted', responded_at=now() where id=$1", [id]);
    await c.query("update tasks set status='completed', completed_at=now() where id=$1", [id]);
  });
  it("rejection needs a reason, and the admin can read it", async () => {
    await as(ids.admin);
    const id = await newTask("designerA");
    await as(ids.desA);
    await expectFail("update tasks set status='rejected' where id=$1", [id]);
    await c.query("update tasks set status='rejected', rejection_reason='Fully booked this week' where id=$1", [id]);
    await as(ids.admin);
    expect((await c.query("select rejection_reason from tasks where id=$1", [id])).rows[0].rejection_reason).toBe("Fully booked this week");
  });
  it("a designer cannot edit task details or act on another designer's task", async () => {
    await as(ids.admin);
    const id = await newTask("designerA");
    await as(ids.desA);
    await expectFail("update tasks set title='Changed title', status='accepted' where id=$1", [id], /cannot edit task details/);
    await as(ids.desB);
    expect((await c.query("update tasks set status='accepted' where id=$1", [id])).rowCount).toBe(0);
  });
});
