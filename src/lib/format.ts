const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export const formatINR = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === "" ? null : inr.format(Number(v));

export function formatBudget(min: string | null, max: string | null) {
  if (!min && !max) return "Not provided";
  if (min && max) return `${formatINR(min)} – ${formatINR(max)}`;
  return min ? `from ${formatINR(min)}` : `up to ${formatINR(max)}`;
}

export const formatIST = (d: Date | string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(d));
