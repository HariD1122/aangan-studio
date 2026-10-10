// Removes ALL demo data: archives demo deals/contacts in HubSpot, deletes demo rows in Neon. Usage: npm run demo:remove
import pg from "pg";

const T = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
const hs = async (method, path, body) => {
  const r = await fetch("https://api.hubapi.com" + path, { method, headers: { Authorization: `Bearer ${T}`, "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  if (r.status === 204) return {};
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${j.message ?? ""}`);
  return j;
};
for (const object of ["deals", "contacts"]) {
  for (;;) {
    const found = await hs("POST", `/crm/v3/objects/${object}/search`, { filterGroups: [{ filters: [{ propertyName: "aangan_is_demo", operator: "EQ", value: "true" }] }], limit: 100 });
    if (!found.results?.length) break;
    for (const r of found.results) await hs("DELETE", `/crm/v3/objects/${object}/${r.id}`);
    console.log(`archived ${found.results.length} demo ${object} in HubSpot`);
  }
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
await db.query("begin");
const c = await db.query("delete from clients where is_demo");
const d = await db.query("delete from designers where is_demo");
await db.query("commit");
console.log(`deleted ${c.rowCount} demo clients and ${d.rowCount} demo designers from Neon`);
await db.end();
