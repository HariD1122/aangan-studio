import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

// Runs inside a rolled-back transaction: nothing stays in the database.
let c: pg.Client;
const ids: Record<string, string> = {};

async function as(userId: string | null) {
  await c.query("reset role");
  if (userId) {
    await c.query("set local role app_user");
    await c.query("select set_config('app.user_id', $1, true)", [userId]);
  }
}
const sync = async (client: string) => (await c.query("select status, attempts from hubspot_sync where client_id = $1", [client])).rows[0];

beforeAll(async () => {
  c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query("begin");
  for (const [k, role] of [["admin", "admin"], ["desk", "front_desk"], ["des", "designer"]]) {
    ids[k] = (await c.query("insert into users(email,password_hash,full_name,role) values ($1,'x',$2,$3) returning id", [`${k}-${Date.now()}@test.local`, k, role])).rows[0].id;
  }
  ids.designer = (await c.query("insert into designers(user_id, full_name) values ($1,'Queue Designer') returning id", [ids.des])).rows[0].id;
});
afterAll(async () => {
  await c.query("rollback");
  await c.end();
});

describe("HubSpot sync queue", () => {
  it("a new client is queued automatically (saved locally first)", async () => {
    await as(ids.desk);
    const id = (await c.query("insert into clients(full_name, phone) values ('Queue Client','+919000000555') returning id")).rows[0].id;
    ids.client = id;
    await as(ids.admin);
    expect(await sync(id)).toEqual({ status: "pending", attempts: 0 });
  });
  it("a change after a successful sync queues it again", async () => {
    await as(null);
    await c.query("update hubspot_sync set status='synced', attempts=0 where client_id=$1", [ids.client]);
    await as(ids.desk);
    await c.query("update clients set project_type='3BHK full home' where id=$1", [ids.client]);
    await as(ids.admin);
    expect((await sync(ids.client)).status).toBe("pending");
  });
  it("assigning a designer queues the client", async () => {
    await as(null);
    await c.query("update hubspot_sync set status='synced' where client_id=$1", [ids.client]);
    await as(ids.admin);
    await c.query("insert into designer_assignments(client_id, designer_id, assigned_by) values ($1,$2,$3)", [ids.client, ids.designer, ids.admin]);
    expect((await sync(ids.client)).status).toBe("pending");
  });
  it("renaming the assigned designer queues their clients", async () => {
    await as(null);
    await c.query("update hubspot_sync set status='synced' where client_id=$1", [ids.client]);
    await c.query("update designers set full_name='Queue Designer Renamed' where id=$1", [ids.designer]);
    expect((await sync(ids.client)).status).toBe("pending");
  });
  it("accepting a meeting for the client queues it; a pending request does not", async () => {
    await as(null);
    await c.query("update hubspot_sync set status='synced' where client_id=$1", [ids.client]);
    const m = (await c.query(
      "insert into meetings(designer_id, client_id, title, starts_at, ends_at, requested_by) values ($1,$2,'Consult','2032-01-01 10:00+05:30','2032-01-01 11:00+05:30',$3) returning id",
      [ids.designer, ids.client, ids.admin])).rows[0].id;
    expect((await sync(ids.client)).status).toBe("synced");
    await c.query("update meetings set status='accepted' where id=$1", [m]);
    expect((await sync(ids.client)).status).toBe("pending");
  });
  it("only admins can see sync status", async () => {
    await as(ids.admin);
    expect((await c.query("select 1 from hubspot_sync")).rowCount).toBeGreaterThan(0);
    for (const k of ["desk", "des"]) {
      await as(ids[k]);
      expect((await c.query("select 1 from hubspot_sync")).rowCount).toBe(0);
    }
  });
  it("nobody can write the queue through the app role", async () => {
    await as(ids.admin);
    await c.query("savepoint s");
    await expect(c.query("update hubspot_sync set status='synced'")).rejects.toThrow(/permission denied/);
    await c.query("rollback to savepoint s");
  });
});
