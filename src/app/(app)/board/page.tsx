import Link from "next/link";
import { requireRole } from "@/server/auth";
import { fetchBoardData } from "@/server/hubspot-board";
import { summarize } from "@/lib/board";
import { formatINR } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Summary – Aangan Studio" };

export default async function Board({ searchParams }: { searchParams: Promise<{ year?: string; demo?: string }> }) {
  await requireRole("admin", "viewer");
  const sp = await searchParams;
  const thisYear = new Date().getFullYear();
  const year = sp.year === "all" ? null : thisYear;
  const includeDemo = sp.demo !== "0";

  let data: Awaited<ReturnType<typeof fetchBoardData>> | null = null;
  let error: string | null = null;
  try { data = await fetchBoardData(); } catch (e) { error = e instanceof Error ? e.message : "Could not read HubSpot."; }

  const link = (over: { year?: string; demo?: string }) => {
    const q = new URLSearchParams({ year: sp.year === "all" ? "all" : "this", demo: includeDemo ? "1" : "0", ...over });
    return `/board?${q}`;
  };
  const pill = (active: boolean) => `rounded-md px-3 py-1.5 text-sm ${active ? "bg-accent text-white" : "hover:bg-accent-soft"}`;

  if (error || !data) {
    return (
      <div>
        <PageHeader title="Summary" />
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">Could not load the numbers from HubSpot. {error}</p>
      </div>
    );
  }

  const s = summarize(data.deals, data.stages, { year, includeDemo });
  const tiles = [
    { label: "Leads generated", value: s.generated },
    { label: "In progress", value: s.inProgress },
    { label: "Converted", value: s.converted },
    { label: "Lost", value: s.lost },
  ];

  return (
    <div>
      <PageHeader title="Summary" subtitle="Live from HubSpot. Read-only." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-line bg-surface p-0.5" role="group" aria-label="Period">
          <Link href={link({ year: "this" })} className={pill(year !== null)}>This year</Link>
          <Link href={link({ year: "all" })} className={pill(year === null)}>All time</Link>
        </div>
        <Link href={link({ demo: includeDemo ? "0" : "1" })} className="text-sm text-accent-strong underline">{includeDemo ? "Hide demo data" : "Show demo data"}</Link>
      </div>
      {s.demoShown > 0 && (
        <p role="note" className="mb-4 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          {s.demoShown} of these leads are sample (DEMO) records, not real business results.
        </p>
      )}

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="p-4">
            <div className="text-sm text-muted">{t.label}</div>
            <div className="mt-1 text-3xl font-semibold tabular-nums">{t.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="converted">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 id="converted" className="text-lg font-semibold">Converted: revenue</h2>
            {s.converted > 0 && <span className="text-sm text-muted">Total {formatINR(s.revenue)}</span>}
          </div>
          {s.convertedList.length === 0 ? <EmptyState title="No converted leads yet" /> : (
            <Card className="divide-y divide-line">
              {s.convertedList.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <span>{l.name} {l.demo && <Badge tone="warning">DEMO</Badge>}</span>
                  <span className="font-medium tabular-nums">{l.amount === null ? <span className="text-muted">Amount not entered</span> : formatINR(l.amount)}</span>
                </div>
              ))}
            </Card>
          )}
        </section>

        <section aria-labelledby="progress">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 id="progress" className="text-lg font-semibold">In progress: quote</h2>
            {s.quoted > 0 && <span className="text-sm text-muted">Quoted {formatINR(s.quoted)}</span>}
          </div>
          {s.inProgressList.length === 0 ? <EmptyState title="Nothing in progress" /> : (
            <Card className="divide-y divide-line">
              {s.inProgressList.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <span>{l.name} {l.demo && <Badge tone="warning">DEMO</Badge>}</span>
                  <span className="font-medium tabular-nums">{l.amount === null ? <span className="text-muted">Not quoted yet</span> : formatINR(l.amount)}</span>
                </div>
              ))}
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
