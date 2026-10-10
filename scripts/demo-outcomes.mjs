// Plays the ADMIN's part for the demo records: sets final budget (Amount) and outcome (deal stage) directly in HubSpot.
// Usage: npm run demo:outcomes   (run after the demo clients have synced)
import pg from "pg";
import { DEMO_CLIENTS, demoPhone } from "./demo-data.mjs";

const T = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
const hs = async (method, path, body) => {
  const r = await fetch("https://api.hubapi.com" + path, { method, headers: { Authorization: `Bearer ${T}`, "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${j.message ?? ""}`);
  return j;
};
const stages = (await hs("GET", "/crm/v3/pipelines/deals/default")).stages;
const stageId = (label) => stages.find((s) => s.label === label)?.id ?? (() => { throw new Error("No stage " + label); })();

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
for (const c of DEMO_CLIENTS) {
  if (!c.outcome) continue;
  const row = (await db.query("select client_id from hubspot_sync hs join clients c on c.id = hs.client_id where c.phone = $1 and c.is_demo", [demoPhone(c.n)])).rows[0];
  if (!row) { console.log("not synced yet:", c.name); continue; }
  const found = await hs("POST", "/crm/v3/objects/deals/search", { filterGroups: [{ filters: [{ propertyName: "aangan_client_id", operator: "EQ", value: row.client_id }] }], limit: 1 });
  const deal = found.results?.[0];
  if (!deal) { console.log("deal not found in HubSpot:", c.name); continue; }
  const o = c.outcome;
  const props = { dealstage: stageId(o.stage) };
  if (o.amount) props.amount = String(o.amount);
  if (o.stage === "Deal Won" || o.stage === "Deal Lost") props.closedate = new Date().toISOString();
  if (o.reason) props.closed_lost_reason = o.reason;
  try { await hs("PATCH", `/crm/v3/objects/deals/${deal.id}`, { properties: props }); }
  catch { delete props.closed_lost_reason; props.description = `Lost reason: ${o.reason}`; await hs("PATCH", `/crm/v3/objects/deals/${deal.id}`, { properties: props }); }
  console.log("set", c.name, "->", o.stage, o.amount ?? "", o.reason ?? "");
}
await db.end();
