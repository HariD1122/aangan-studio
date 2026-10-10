/** Builds the Telegram text for a new lead. Pure (no network) so it can be tested.
 *  Privacy: the group message deliberately has NO phone number or email. Staff open the lead in the app (login required). */
export type LeadForMessage = {
  id: string; full_name: string; project_type: string | null; project_location: string | null; property_type: string | null;
  area_value: string | null; area_unit: string | null; budget_min: string | null; budget_max: string | null;
  timeline: string | null; source: string | null; qualification_status: string;
};

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const inr = (v: string) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(v));

export function budgetText(min: string | null, max: string | null): string | null {
  if (min && max) return `${inr(min)} – ${inr(max)}`;
  if (min) return `from ${inr(min)}`;
  if (max) return `up to ${inr(max)}`;
  return null;
}

const QUAL: Record<string, string> = { qualified: "Looks qualified", not_qualified: "May not fit our criteria", needs_review: "Needs a human review", unreviewed: "Not reviewed yet" };

export function leadMessage(l: LeadForMessage, appUrl: string): string {
  const area = l.area_value ? `${Number(l.area_value)} ${l.area_unit === "sqm" ? "sq m" : "sq ft"}` : null;
  const rows: [string, string | null][] = [
    ["Project", [l.project_type, l.property_type].filter(Boolean).join(" · ") || null],
    ["Location", l.project_location], ["Area", area], ["Budget (stated)", budgetText(l.budget_min, l.budget_max)],
    ["Timeline", l.timeline], ["Source", l.source], ["Status", QUAL[l.qualification_status] ?? null],
  ];
  const body = rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${escapeHtml(v as string)}`).join("\n");
  const link = `<a href="${escapeHtml(appUrl)}/clients/${l.id}">Open in Aangan Studio</a>`;
  return `<b>New lead: ${escapeHtml(l.full_name)}</b>\n${body}\n\n${link}`;
}
