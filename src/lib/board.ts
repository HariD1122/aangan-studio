/** Turns HubSpot deals into the simple CEO summary. Pure functions (no network) so they can be tested. */
export type Deal = { id: string; name: string; amount: number | null; stageId: string; demo: boolean; createdYear: number };
export type StageInfo = { id: string; closed: boolean; won: boolean };
export type Line = { id: string; name: string; amount: number | null; demo: boolean };

export type Summary = {
  generated: number; inProgress: number; converted: number; lost: number;
  convertedList: Line[]; inProgressList: Line[]; revenue: number; quoted: number; demoShown: number;
};

/** Deal names are "Client name - Project type"; the board only needs the client name. */
export const leadName = (dealName: string) => dealName.split(" - ")[0].trim() || dealName;

export function summarize(deals: Deal[], stages: StageInfo[], opts: { year: number | null; includeDemo: boolean }): Summary {
  const byId = new Map(stages.map((s) => [s.id, s]));
  const shown = deals.filter((d) => (opts.includeDemo || !d.demo) && (opts.year === null || d.createdYear === opts.year));
  const line = (d: Deal): Line => ({ id: d.id, name: leadName(d.name), amount: d.amount, demo: d.demo });
  const converted: Line[] = [], inProgress: Line[] = [];
  let lost = 0;
  for (const d of shown) {
    const s = byId.get(d.stageId);
    if (s?.closed && s.won) converted.push(line(d));
    else if (s?.closed) lost++;
    else inProgress.push(line(d));
  }
  const byAmount = (a: Line, b: Line) => (b.amount ?? -1) - (a.amount ?? -1) || a.name.localeCompare(b.name);
  converted.sort(byAmount);
  inProgress.sort(byAmount);
  return {
    generated: shown.length, inProgress: inProgress.length, converted: converted.length, lost,
    convertedList: converted, inProgressList: inProgress,
    revenue: converted.reduce((t, l) => t + (l.amount ?? 0), 0),
    quoted: inProgress.reduce((t, l) => t + (l.amount ?? 0), 0),
    demoShown: shown.filter((d) => d.demo).length,
  };
}
