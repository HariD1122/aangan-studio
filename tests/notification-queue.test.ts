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
const alerts = async (client: string) => (await c.query("select kind, status from notification_queue where client_id = $1", [client])).rows;

beforeAll(async () => {
  c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query("begin");
  for (const [k, role] of [["admin", "admin"], ["desk", "front_desk"]]) {
    ids[k] = (await c.query("insert into users(email,password_hash,full_name,role) values ($1,'x',$2,$3) returning id", [`${k}-${Date.now()}@test.local`, k, role])).rows[0].id;
  }
});
afterAll(async () => {
  await c.query("rollback");
  await c.end();
});

describe("Telegram new-lead queue", () => {
  it("a new real client queues exactly one alert", async () => {
    await as(ids.desk);
    ids.real = (await c.query("insert into clients(full_name, phone) values ('Real Lead','+919000000777') returning id")).rows[0].id;
    await as(ids.admin);
    expect(await alerts(ids.real)).toEqual([{ kind: "new_lead", status: "pending" }]);
  });
  it("editing the client does not queue another alert", async () => {
    await as(ids.desk);
    await c.query("update clients set project_type = 'Full home' where id = $1", [ids.real]);
    await as(ids.admin);
    expect(await alerts(ids.real)).toHaveLength(1);
  });
  it("demo clients never alert", async () => {
    await as(null);
    const id = (await c.query("insert into clients(full_name, phone, is_demo) values ('Demo Lead','+919000000778', true) returning id")).rows[0].id;
    expect(await alerts(id)).toHaveLength(0);
  });
  it("only admins can see the alert queue", async () => {
    await as(ids.admin);
    expect((await c.query("select 1 from notification_queue")).rowCount).toBeGreaterThan(0);
    await as(ids.desk);
    expect((await c.query("select 1 from notification_queue")).rowCount).toBe(0);
  });
  it("nobody can write the queue through the app role", async () => {
    await as(ids.admin);
    await c.query("savepoint s");
    await expect(c.query("update notification_queue set status = 'sent'")).rejects.toThrow(/permission denied/);
    await c.query("rollback to savepoint s");
  });
});
