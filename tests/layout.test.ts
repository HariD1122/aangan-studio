import { describe, it, expect } from "vitest";
import { layoutOverlaps } from "../src/lib/layout";
import { addDays, istKey, parseIstLocal, shiftMonth, weekdayMon0 } from "../src/lib/time";

describe("layoutOverlaps", () => {
  it("keeps non-overlapping events full width", () => {
    const r = layoutOverlaps([{ startMin: 60, endMin: 120 }, { startMin: 120, endMin: 180 }]);
    expect(r.map((x) => [x.col, x.cols])).toEqual([[0, 1], [0, 1]]);
  });
  it("puts overlapping events in separate columns", () => {
    const r = layoutOverlaps([{ startMin: 60, endMin: 150 }, { startMin: 120, endMin: 180 }]);
    expect(r.map((x) => [x.col, x.cols])).toEqual([[0, 2], [1, 2]]);
  });
});

describe("IST time helpers", () => {
  it("reads datetime-local text as India time", () => {
    expect(parseIstLocal("2026-10-12T15:30")?.toISOString()).toBe("2026-10-12T10:00:00.000Z");
    expect(parseIstLocal("nonsense")).toBeNull();
  });
  it("late-evening UTC is already the next day in IST", () => {
    expect(istKey(new Date("2026-10-12T20:00:00Z"))).toBe("2026-10-13");
  });
  it("date maths", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftMonth("2026-12-15", 1)).toBe("2027-01-01");
    expect(weekdayMon0("2026-10-12")).toBe(0); // Monday
  });
});
