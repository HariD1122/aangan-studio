import { describe, it, expect } from "vitest";
import { leadName, summarize, type Deal, type StageInfo } from "../src/lib/board";

const stages: StageInfo[] = [
  { id: "new", closed: false, won: false }, { id: "neg", closed: false, won: false },
  { id: "won", closed: true, won: true }, { id: "lost", closed: true, won: false },
];
const d = (id: string, stageId: string, amount: number | null, extra: Partial<Deal> = {}): Deal =>
  ({ id, name: `Lead ${id} - Full home`, amount, stageId, demo: false, createdYear: 2026, ...extra });

describe("board summary", () => {
  const deals = [d("a", "won", 2750000), d("b", "won", 3800000), d("c", "lost", null), d("e", "neg", 1600000), d("f", "new", null), d("g", "new", null, { demo: true })];

  it("counts leads, in progress, converted and lost", () => {
    const s = summarize(deals, stages, { year: null, includeDemo: true });
    expect([s.generated, s.inProgress, s.converted, s.lost]).toEqual([6, 3, 2, 1]);
  });
  it("lists converted revenue, biggest first, and totals it", () => {
    const s = summarize(deals, stages, { year: null, includeDemo: true });
    expect(s.convertedList.map((l) => [l.name, l.amount])).toEqual([["Lead b", 3800000], ["Lead a", 2750000]]);
    expect(s.revenue).toBe(6550000);
  });
  it("lists in-progress quotes and keeps unquoted leads (amount null) at the end", () => {
    const s = summarize(deals, stages, { year: null, includeDemo: true });
    expect(s.inProgressList.map((l) => [l.name, l.amount])).toEqual([["Lead e", 1600000], ["Lead f", null], ["Lead g", null]]);
    expect(s.quoted).toBe(1600000);
  });
  it("can hide demo deals", () => {
    const s = summarize(deals, stages, { year: null, includeDemo: false });
    expect(s.generated).toBe(5);
    expect(s.demoShown).toBe(0);
  });
  it("filters by year", () => {
    const s = summarize([...deals, d("old", "won", 999, { createdYear: 2025 })], stages, { year: 2026, includeDemo: true });
    expect(s.generated).toBe(6);
  });
  it("a deal in an unknown stage is treated as in progress, never silently dropped", () => {
    expect(summarize([d("x", "mystery", null)], stages, { year: null, includeDemo: true }).inProgress).toBe(1);
  });
  it("shows only the client name", () => {
    expect(leadName("Rhea Kulkarni - Full home")).toBe("Rhea Kulkarni");
    expect(leadName("Single")).toBe("Single");
  });
});
