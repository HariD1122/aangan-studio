import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

// Every test runs inside a transaction that is rolled back: nothing is left in the database.
let c: pg.Client;
const ids: Record<string, string> = {};

async function as(userId: string | null) {
  await c.query("reset role");
  if (userId) {
    await c.query("set local role app_user");
    await c.query("select set_config('app.user_id', $1, true)", [userId]);
  }
}
async function user(key: string, role: string, canAssign = false) {
  const r = await c.query(
    "insert into users(email, password_hash, full_name, role, can_assign_leads) values ($1,'x',$4,$2,$3) returning id",
    [`${key}-${Date.now()}@test.local`, role, canAssign, key],
  );
  ids[key] = r.rows[0].id;
}

beforeAll(async () => {
  c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query("begin");
  await user("admin", "admin");
  await user("desk", "front_desk");
  await user("deskAssign", "front_desk", true);
  await user("viewer", "viewer");
  await user("desA", "designer");
  await user("desB", "designer");
  for (const k of ["A", "B"]) {
    const d = await c.query("insert into designers(user_id, full_name) values ($1,$2) returning id", [ids["des" + k], "Designer " + k]);
    ids["designer" + k] = d.rows[0].id;
    const cl = await c.query("insert into clients(full_name, phone) values ($1,$2) returning id", ["Client " + k, "+9190000000" + (k === "A" ? "01" : "02")]);
    ids["client" + k] = cl.rows[0].id;
    await c.query("insert into designer_assignments(client_id, designer_id) values ($1,$2)", [ids["client" + k], ids["designer" + k]]);
  }
});
afterAll(async () => {
  await c.query("rollback");
  await c.end();
});

const names = async (sql: string) => (await c.query(sql)).rows.map((r) => r.full_name).sort();

describe("Row Level Security", () => {
  it("designer sees only their own assigned client", async () => {
    await as(ids.desA);
    expect(await names("select full_name from clients")).toEqual(["Client A"]);
  });
  it("designer cannot read another designer's client by id", async () => {
    await as(ids.desA);
    expect((await c.query("select 1 from clients where id = $1", [ids.clientB])).rowCount).toBe(0);
  });
  it("designer cannot see other designers' assignments", async () => {
    await as(ids.desB);
    expect((await c.query("select 1 from designer_assignments")).rowCount).toBe(1);
  });
  it("admin, front desk and viewer see all clients", async () => {
    for (const k of ["admin", "desk", "viewer"]) {
      await as(ids[k]);
      expect((await c.query("select 1 from clients")).rowCount).toBe(2);
    }
  });
  it("no logged-in user sees nothing", async () => {
    await c.query("reset role");
    await c.query("set local role app_user");
    await c.query("select set_config('app.user_id', '', true)");
    expect((await c.query("select 1 from clients")).rowCount).toBe(0);
  });
  it("designer cannot edit clients", async () => {
    await as(ids.desA);
    expect((await c.query("update clients set full_name = 'hacked' where id = $1", [ids.clientA])).rowCount).toBe(0);
  });
  it("viewer cannot create clients", async () => {
    await as(ids.viewer);
    await c.query("savepoint s");
    await expect(c.query("insert into clients(full_name, phone) values ('x','+919999999999')")).rejects.toThrow();
    await c.query("rollback to savepoint s");
  });
  it("front desk without assign permission cannot assign; with permission can", async () => {
    await as(ids.desk);
    await c.query("savepoint s");
    await expect(c.query("insert into designer_assignments(client_id, designer_id) values ($1,$2)", [ids.clientA, ids.designerB])).rejects.toThrow();
    await c.query("rollback to savepoint s");
    await as(ids.deskAssign);
    await c.query("update designer_assignments set unassigned_at = now() where client_id = $1", [ids.clientA]);
    await c.query("insert into designer_assignments(client_id, designer_id) values ($1,$2)", [ids.clientA, ids.designerB]);
  });
  it("only one active designer per client", async () => {
    await as(ids.admin);
    await c.query("savepoint s");
    await expect(c.query("insert into designer_assignments(client_id, designer_id) values ($1,$2)", [ids.clientB, ids.designerA])).rejects.toThrow(/one_active_assignment/);
    await c.query("rollback to savepoint s");
  });
  it("nobody can promote themselves or edit users through the app role", async () => {
    await as(ids.desA);
    await c.query("savepoint s");
    await expect(c.query("update users set role = 'admin' where id = $1", [ids.desA])).rejects.toThrow(/permission denied/);
    await c.query("rollback to savepoint s");
  });
  it("only admin can read the audit log; users can only write their own audit entries", async () => {
    await as(ids.admin);
    await c.query("insert into audit_logs(actor_id, action, entity) values ($1,'t','t')", [ids.admin]);
    expect((await c.query("select 1 from audit_logs")).rowCount).toBeGreaterThan(0);
    await as(ids.desk);
    expect((await c.query("select 1 from audit_logs")).rowCount).toBe(0);
    await c.query("savepoint s");
    await expect(c.query("insert into audit_logs(actor_id, action, entity) values ($1,'forged','t')", [ids.admin])).rejects.toThrow();
    await c.query("rollback to savepoint s");
  });
});
