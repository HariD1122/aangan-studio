// Applies supabase/migrations/*.sql in order, once each. Usage: npm run db:migrate
import pg from "pg";
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "db", "migrations");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
const done = new Set((await client.query("select name from schema_migrations")).rows.map((r) => r.name));
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(f)) { console.log("skip  ", f); continue; }
  await client.query("begin");
  try {
    await client.query(fs.readFileSync(path.join(dir, f), "utf8"));
    await client.query("insert into schema_migrations(name) values ($1)", [f]);
    await client.query("commit");
    console.log("applied", f);
  } catch (e) {
    await client.query("rollback");
    console.error("FAILED ", f, e.message);
    process.exit(1);
  }
}
await client.end();
