/** Indian mobile numbers are stored as +91XXXXXXXXXX so duplicates can be detected. */
export function normalizePhone(raw: string): string | null {
  const d = raw.replace(/[^\d+]/g, "");
  const digits = d.replace(/^\+/, "");
  if (/^\d{10}$/.test(digits)) return `+91${digits}`;
  if (/^91\d{10}$/.test(digits)) return `+${digits}`;
  if (/^\+\d{8,15}$/.test(d)) return d;
  return null;
}
