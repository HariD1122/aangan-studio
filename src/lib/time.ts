// All business times are India Standard Time (UTC+05:30, no daylight saving). Stored in UTC, shown in IST.
const IST = "Asia/Kolkata";
const OFFSET = "+05:30";

/** YYYY-MM-DD of an instant, as seen in IST. */
export const istKey = (d: Date | string) => new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(new Date(d));

export const istTime = (d: Date | string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: IST, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(d));

export const istDateTime = (d: Date | string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: IST, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(d));

export const startOfIstDay = (key: string) => new Date(`${key}T00:00:00${OFFSET}`);

/** Parses `<input type="datetime-local">` text (e.g. 2026-10-12T15:30) as IST. */
export function parseIstLocal(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00${OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const noon = (key: string) => new Date(`${key}T12:00:00${OFFSET}`);

export function addDays(key: string, n: number): string {
  const d = noon(key);
  d.setUTCDate(d.getUTCDate() + n);
  return istKey(d);
}

/** 0 = Monday ... 6 = Sunday */
export const weekdayMon0 = (key: string) => (noon(key).getUTCDay() + 6) % 7;

export const isKey = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(noon(v).getTime());

export const todayKey = () => istKey(new Date());

export function shiftMonth(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}

export const monthLabel = (key: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: IST, month: "long", year: "numeric" }).format(noon(key));

export const dayLabel = (key: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: IST, weekday: "short", day: "numeric", month: "short" }).format(noon(key));
