import "server-only";
import { after } from "next/server";
import { pool } from "./db";

/**
 * One-way sync Neon -> HubSpot.
 *  - The app writes: contact details, project context, STATED budget, assigned designer, live status.
 *  - The admin writes IN HubSpot: final budget (deal Amount) and outcome (deal stage / lost reason).
 *  - The app NEVER sends `amount`, `dealstage` (after creation) or `closedate`, so it cannot overwrite the admin.
 * Tasks and meetings are never sent to HubSpot.
 */

const BASE = "https://api.hubapi.com";
const GROUP = "aangan_studio";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class HubSpotError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function friendly(status: number, body: unknown): string {
  const raw = typeof (body as { message?: string })?.message === "string" ? (body as { message: string }).message : "";
  if (status === 401) return "HubSpot rejected the access token (expired or wrong).";
  if (status === 403) return `The HubSpot token is missing a permission. ${raw}`.slice(0, 240);
  if (status === 404) return "HubSpot record not found.";
  if (status === 409) return `HubSpot reported a conflict. ${raw}`.slice(0, 240);
  if (status === 429) return "HubSpot rate limit reached; will retry.";
  if (status >= 500) return "HubSpot is temporarily unavailable; will retry.";
  return `HubSpot rejected the request (${status}). ${raw}`.slice(0, 240);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function hs(method: string, path: string, body?: unknown): Promise<any> {
  if (!process.env.HUBSPOT_PRIVATE_APP_TOKEN) throw new HubSpotError(0, "HubSpot token is not configured.");
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(BASE + path, {
        method,
        headers: { Authorization: `Bearer ${process.env.HUBSPOT_PRIVATE_APP_TOKEN}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      if (attempt < 2) { await sleep(500 * 2 ** attempt); continue; }
      throw new HubSpotError(0, "HubSpot did not respond (network problem or timeout).");
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      const retryAfter = Number(res.headers.get("retry-after")) || 0;
      await sleep(Math.max(retryAfter * 1000, 600 * 2 ** attempt));
      continue;
    }
    if (res.status === 204) return null;
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new HubSpotError(res.status, friendly(res.status, json));
    return json;
  }
}

// ---------- custom fields ----------
type Prop = { name: string; label: string; type?: "string" | "number"; fieldType?: "text" | "number" | "textarea"; unique?: boolean };
const prop = (name: string, label: string, extra: Partial<Prop> = {}): Prop => ({ name, label, ...extra });

const DEAL_PROPS: Prop[] = [
  prop("aangan_client_id", "Aangan client ID", { unique: true }),
  prop("aangan_stated_budget_min", "Stated budget minimum (INR, from call)", { type: "number", fieldType: "number" }),
  prop("aangan_stated_budget_max", "Stated budget maximum (INR, from call)", { type: "number", fieldType: "number" }),
  prop("aangan_project_type", "Project type"),
  prop("aangan_project_location", "Project location"),
  prop("aangan_property_type", "Property type"),
  prop("aangan_area", "Carpet area"),
  prop("aangan_timeline", "Timeline"),
  prop("aangan_requirements", "Requirements", { fieldType: "textarea" }),
  prop("aangan_assigned_designer", "Assigned designer"),
  prop("aangan_live_status", "Live status (from app)"),
  prop("aangan_qualification", "Qualification (from app)"),
  prop("aangan_is_demo", "Demo record"),
];
const CONTACT_PROPS: Prop[] = [prop("aangan_client_id", "Aangan client ID", { unique: true }), prop("aangan_is_demo", "Demo record")];

async function ensureProps(object: "contacts" | "deals", props: Prop[]): Promise<{ created: number; existing: number }> {
  let created = 0, existing = 0;
  try {
    await hs("POST", `/crm/v3/properties/${object}/groups`, { name: GROUP, label: "Aangan Studio", displayOrder: -1 });
  } catch (e) {
    if (!(e instanceof HubSpotError && e.status === 409)) throw e;
  }
  for (const p of props) {
    try {
      await hs("POST", `/crm/v3/properties/${object}`, {
        name: p.name, label: p.label, groupName: GROUP,
        type: p.type ?? "string", fieldType: p.fieldType ?? "text",
        ...(p.unique ? { hasUniqueValue: true } : {}),
      });
      created++;
    } catch (e) {
      if (e instanceof HubSpotError && e.status === 409) existing++;
      else throw e;
    }
  }
  return { created, existing };
}

export async function setupHubSpotFields() {
  const contacts = await ensureProps("contacts", CONTACT_PROPS);
  const deals = await ensureProps("deals", DEAL_PROPS);
  return { created: contacts.created + deals.created, existing: contacts.existing + deals.existing };
}

export type Health = {
  connected: boolean; portalId?: string; error?: string; fieldsReady: boolean;
  stages: { id: string; label: string; closed: boolean }[]; newDealStage?: string;
};

export async function getStages() {
  const p = await hs("GET", "/crm/v3/pipelines/deals/default");
  return (p.stages as { id: string; label: string; metadata?: { isClosed?: string | boolean } }[])
    .sort((a, b) => (a as unknown as { displayOrder: number }).displayOrder - (b as unknown as { displayOrder: number }).displayOrder)
    .map((s) => ({ id: s.id, label: s.label, closed: String(s.metadata?.isClosed) === "true" }));
}

export async function getNewDealStage(): Promise<string> {
  const saved = (await pool.query("select value from studio_settings where key = 'hubspot.new_deal_stage'")).rows[0]?.value as string | undefined;
  const stages = await getStages();
  if (saved && stages.some((s) => s.id === saved && !s.closed)) return saved;
  const lead = stages.find((s) => !s.closed && /lead captured/i.test(s.label)) ?? stages.find((s) => !s.closed);
  if (!lead) throw new HubSpotError(0, "No open deal stage found in the HubSpot pipeline.");
  return lead.id;
}

export async function getHealth(): Promise<Health> {
  const base: Health = { connected: false, fieldsReady: false, stages: [] };
  try {
    const a = await hs("GET", "/account-info/v3/details");
    base.connected = true;
    base.portalId = String(a.portalId);
  } catch (e) {
    return { ...base, error: (e as Error).message };
  }
  try {
    await hs("GET", "/crm/v3/properties/deals/aangan_client_id");
    base.fieldsReady = true;
  } catch { /* not set up yet */ }
  try {
    base.stages = await getStages();
    base.newDealStage = await getNewDealStage();
  } catch (e) {
    base.error = (e as Error).message;
  }
  return base;
}

export const dealUrl = (portalId: string | undefined, dealId: string | null | undefined) =>
  portalId && dealId ? `${process.env.HUBSPOT_APP_URL ?? "https://app-na2.hubspot.com"}/contacts/${portalId}/record/0-3/${dealId}` : null;

// ---------- syncing one client ----------
type Row = {
  id: string; full_name: string; phone: string; email: string | null; project_type: string | null; project_location: string | null;
  property_type: string | null; area_value: string | null; area_unit: string | null; budget_min: string | null; budget_max: string | null;
  timeline: string | null; requirements: string | null; qualification_status: string; is_demo: boolean; designer: string | null;
  queued_token: string; hubspot_contact_id: string | null; hubspot_deal_id: string | null; has_meeting: boolean; had_meeting: boolean;
};

export function liveStatus(r: Pick<Row, "designer" | "has_meeting" | "had_meeting">): string {
  if (r.has_meeting) return "Consultation scheduled";
  if (r.had_meeting) return "Consultation date passed";
  if (r.designer) return "Assigned to designer";
  return "New enquiry";
}

const clean = (v: unknown) => (v === null || v === undefined || v === "" ? undefined : v);

async function findByClientId(object: "contacts" | "deals", clientId: string): Promise<string | null> {
  const r = await hs("POST", `/crm/v3/objects/${object}/search`, {
    filterGroups: [{ filters: [{ propertyName: "aangan_client_id", operator: "EQ", value: clientId }] }], limit: 1,
  });
  return r.results?.[0]?.id ?? null;
}

async function upsertContact(r: Row): Promise<string> {
  const [first, ...rest] = r.full_name.trim().split(/\s+/);
  const base: Record<string, unknown> = {
    firstname: first, lastname: rest.join(" ") || undefined, phone: r.phone, email: clean(r.email),
    aangan_client_id: r.id, aangan_is_demo: r.is_demo ? "true" : "false",
  };
  for (const k of Object.keys(base)) if (base[k] === undefined) delete base[k];
  try {
    return await writeContact(r, base);
  } catch (e) {
    // A mistyped email must not block the whole client: retry once without it (the phone number still identifies them).
    if (e instanceof HubSpotError && e.status === 400 && /INVALID_EMAIL/.test(e.message) && base.email) {
      const { email: _dropped, ...withoutEmail } = base;
      void _dropped;
      return await writeContact(r, withoutEmail);
    }
    throw e;
  }
}

async function writeContact(r: Row, props: Record<string, unknown>): Promise<string> {
  let id = r.hubspot_contact_id;
  if (id) {
    try { await hs("PATCH", `/crm/v3/objects/contacts/${id}`, { properties: props }); return id; }
    catch (e) { if (!(e instanceof HubSpotError && e.status === 404)) throw e; id = null; } // deleted in HubSpot: recreate
  }
  id = await findByClientId("contacts", r.id);
  if (!id && props.email) {
    const byEmail = await hs("POST", "/crm/v3/objects/contacts/search", {
      filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: props.email }] }], limit: 1,
    });
    id = byEmail.results?.[0]?.id ?? null; // adopt an existing contact instead of creating a duplicate
  }
  if (id) { await hs("PATCH", `/crm/v3/objects/contacts/${id}`, { properties: props }); return id; }
  const created = await hs("POST", "/crm/v3/objects/contacts", { properties: props });
  return created.id as string;
}

function dealProps(r: Row): Record<string, unknown> {
  const area = r.area_value ? `${Number(r.area_value)} ${r.area_unit === "sqm" ? "sq m" : "sq ft"}` : undefined;
  const p: Record<string, unknown> = {
    dealname: `${r.full_name} - ${r.project_type ?? "Interior project"}`,
    aangan_client_id: r.id,
    aangan_stated_budget_min: clean(r.budget_min), aangan_stated_budget_max: clean(r.budget_max),
    aangan_project_type: clean(r.project_type), aangan_project_location: clean(r.project_location), aangan_property_type: clean(r.property_type),
    aangan_area: area, aangan_timeline: clean(r.timeline), aangan_requirements: clean(r.requirements),
    aangan_assigned_designer: r.designer ?? "Not assigned yet", aangan_live_status: liveStatus(r),
    aangan_qualification: r.qualification_status, aangan_is_demo: r.is_demo ? "true" : "false",
  };
  for (const k of Object.keys(p)) if (p[k] === undefined) delete p[k];
  return p;
}

async function upsertDeal(r: Row, contactId: string): Promise<string> {
  const props = dealProps(r); // note: no amount, no dealstage, no closedate
  let id = r.hubspot_deal_id;
  if (id) {
    try { await hs("PATCH", `/crm/v3/objects/deals/${id}`, { properties: props }); }
    catch (e) { if (e instanceof HubSpotError && e.status === 404) id = null; else throw e; }
  }
  if (!id) id = await findByClientId("deals", r.id);
  if (id && id !== r.hubspot_deal_id) await hs("PATCH", `/crm/v3/objects/deals/${id}`, { properties: props });
  if (!id) {
    const created = await hs("POST", "/crm/v3/objects/deals", { properties: { ...props, pipeline: "default", dealstage: await getNewDealStage() } });
    id = created.id as string;
  }
  await hs("PUT", `/crm/v4/objects/deals/${id}/associations/default/contacts/${contactId}`);
  return id;
}

const LOAD = `
  select c.id, c.full_name, c.phone, c.email, c.project_type, c.project_location, c.property_type, c.area_value, c.area_unit,
         c.budget_min, c.budget_max, c.timeline, c.requirements, c.qualification_status, c.is_demo, d.full_name as designer,
         hs.queued_at::text as queued_token, hs.hubspot_contact_id, hs.hubspot_deal_id,
         exists(select 1 from meetings m where m.client_id = c.id and m.status = 'accepted' and m.ends_at > now()) as has_meeting,
         exists(select 1 from meetings m where m.client_id = c.id and m.status = 'accepted' and m.ends_at <= now()) as had_meeting
    from clients c
    join hubspot_sync hs on hs.client_id = c.id
    left join designer_assignments a on a.client_id = c.id and a.unassigned_at is null
    left join designers d on d.id = a.designer_id
   where c.id = $1`;

export async function syncClient(clientId: string): Promise<{ ok: boolean; error?: string }> {
  const row = (await pool.query(LOAD, [clientId])).rows[0] as Row | undefined;
  if (!row) return { ok: false, error: "Client not found." };
  try {
    const contactId = await upsertContact(row);
    const dealId = await upsertDeal(row, contactId);
    await pool.query(
      `update hubspot_sync set hubspot_contact_id = $2, hubspot_deal_id = $3, last_synced_at = now(), attempts = 0, last_error = null,
              status = case when queued_at::text = $4 then 'synced' else 'pending' end, updated_at = now()
        where client_id = $1`,
      [clientId, contactId, dealId, row.queued_token],
    );
    return { ok: true };
  } catch (e) {
    const msg = e instanceof HubSpotError ? e.message : "Unexpected error while syncing.";
    if (!(e instanceof HubSpotError)) console.error("hubspot sync failed", (e as Error).message);
    await pool.query(
      `update hubspot_sync set status = 'failed', attempts = attempts + 1, last_error = $2, updated_at = now(),
              next_attempt_at = now() + make_interval(mins => least(60, power(2, least(attempts, 6))::int))
        where client_id = $1`,
      [clientId, msg],
    );
    return { ok: false, error: msg };
  }
}

/** Claims due rows (so two workers never take the same one), then syncs them one by one. */
export async function processPending(limit = 10): Promise<{ synced: number; failed: number }> {
  const claimed = await pool.query(
    `update hubspot_sync set next_attempt_at = now() + interval '3 minutes'
      where client_id in (select client_id from hubspot_sync where status in ('pending','failed') and next_attempt_at <= now()
                           order by queued_at limit $1 for update skip locked)
      returning client_id`,
    [limit],
  );
  let synced = 0, failed = 0;
  for (const { client_id } of claimed.rows) {
    const r = await syncClient(client_id);
    if (r.ok) synced++; else failed++;
    await sleep(120); // stay well under HubSpot's rate limit
  }
  return { synced, failed };
}

/** Call from a server action: pushes queued changes right after the response is sent. */
export function kickSync() {
  if (!process.env.HUBSPOT_PRIVATE_APP_TOKEN) return;
  after(async () => {
    try { await processPending(5); } catch (e) { console.error("kickSync failed", (e as Error).message); }
  });
}
