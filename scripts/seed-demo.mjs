// Adds the DEMO designers and 10 DEMO clients to Neon (safe to re-run). Usage: npm run demo:seed
import pg from "pg";
import { DEMO_DESIGNERS, DEMO_CLIENTS, demoPhone, demoEmail } from "./demo-data.mjs";

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
await db.query("begin");
const designerIds = [];
for (const d of DEMO_DESIGNERS) {
  const name = `Demo - ${d.name}`;
  const ex = await db.query("select id from designers where full_name = $1 and is_demo", [name]);
  designerIds.push(ex.rows[0]?.id ?? (await db.query(
    "insert into designers(full_name, specializations, experience_years, is_demo) values ($1,$2,$3,true) returning id", [name, d.specializations, d.years])).rows[0].id);
}
let added = 0;
for (const c of DEMO_CLIENTS) {
  const ex = await db.query("select id from clients where phone = $1 and is_demo", [demoPhone(c.n)]);
  if (ex.rows[0]) continue;
  const r = await db.query(
    `insert into clients(full_name, phone, email, project_type, project_location, property_type, area_value, area_unit, budget_min, budget_max,
       timeline, requirements, qualification_status, source, is_demo)
     values ($1,$2,$3,$4,$5,$6,$7,'sqft',$8,$9,$10,$11,$12,$13,true) returning id`,
    [c.name, demoPhone(c.n), demoEmail(c.n), c.type, c.loc, c.prop, c.area, c.min, c.max, c.timeline, c.req, c.qual, c.source]);
  if (c.designer !== null) await db.query("insert into designer_assignments(client_id, designer_id) values ($1,$2)", [r.rows[0].id, designerIds[c.designer]]);
  added++;
}
await db.query("commit");
console.log(`Demo designers: ${designerIds.length}. Demo clients added: ${added} (existing ones skipped).`);
await db.end();
