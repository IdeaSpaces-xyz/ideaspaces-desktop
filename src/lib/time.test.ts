import { describe, expect, it } from "vitest";
import { bucketByTime, calendarDayDiff, relativeTime } from "./time";

// Fixed local "now" — these functions take an injectable clock precisely so the
// tests never read the wall clock and never flake.
const NOW = new Date(2026, 5, 15, 12, 0, 0); // 2026-06-15 12:00 local

describe("calendarDayDiff", () => {
  it("counts calendar days, not 24h windows", () => {
    // 23:30 → 00:30 is one calendar day even though they're <24h apart.
    expect(calendarDayDiff(new Date(2026, 5, 15, 0, 30), new Date(2026, 5, 14, 23, 30))).toBe(1);
  });

  it("is 0 for the same day and negative for the future", () => {
    expect(calendarDayDiff(NOW, new Date(2026, 5, 15, 8))).toBe(0);
    expect(calendarDayDiff(NOW, new Date(2026, 5, 16, 8))).toBe(-1);
  });
});

describe("relativeTime", () => {
  it("clamps sub-minute and future timestamps to 'just now'", () => {
    expect(relativeTime(new Date(2026, 5, 15, 11, 59, 30), NOW)).toBe("just now");
    expect(relativeTime(new Date(2026, 5, 15, 13, 0, 0), NOW)).toBe("just now");
  });

  it("shows minutes, then hours", () => {
    expect(relativeTime(new Date(2026, 5, 15, 11, 30), NOW)).toBe("30m ago");
    expect(relativeTime(new Date(2026, 5, 15, 9, 0), NOW)).toBe("3h ago");
  });

  it("prefers the day name once a calendar boundary is crossed", () => {
    expect(relativeTime(new Date(2026, 5, 14, 12), NOW)).toBe("yesterday");
    expect(relativeTime(new Date(2026, 5, 12, 12), NOW)).toBe("3d ago");
  });

  it("falls back to a short date, with the year only when it differs", () => {
    expect(relativeTime(new Date(2026, 3, 21, 12), NOW)).toBe("Apr 21");
    expect(relativeTime(new Date(2025, 3, 21, 12), NOW)).toBe("Apr 21, 2025");
  });

  it("returns '' for an unparseable value", () => {
    expect(relativeTime("not a date", NOW)).toBe("");
  });
});

describe("bucketByTime", () => {
  interface Item {
    id: string;
    date: Date | string;
  }
  const bucket = (items: Item[]) => bucketByTime(items, (i) => i.date, NOW);

  it("groups into Today / Yesterday / This week / Earlier this month / per-month, newest first", () => {
    const out = bucket([
      { id: "today", date: new Date(2026, 5, 15, 9) },
      { id: "yesterday", date: new Date(2026, 5, 14, 9) },
      { id: "thisweek", date: new Date(2026, 5, 11, 9) }, // 4 days ago
      { id: "earlier", date: new Date(2026, 5, 2, 9) }, // same month, >6 days
      { id: "march", date: new Date(2026, 2, 9, 9) },
      { id: "dec", date: new Date(2025, 11, 9, 9) },
    ]);
    expect(out.map((b) => b.label)).toEqual([
      "Today",
      "Yesterday",
      "This week",
      "Earlier this month",
      "March 2026",
      "December 2025",
    ]);
    expect(out[0].items.map((i) => i.id)).toEqual(["today"]);
  });

  it("clamps future timestamps into Today", () => {
    const out = bucket([{ id: "future", date: new Date(2026, 5, 16, 9) }]);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("Today");
  });

  it("preserves input order within a bucket (no re-sort)", () => {
    const out = bucket([
      { id: "a", date: new Date(2026, 5, 15, 8) },
      { id: "b", date: new Date(2026, 5, 15, 11) },
    ]);
    expect(out[0].items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("skips items with an unparseable date", () => {
    expect(bucket([{ id: "x", date: "nope" }])).toHaveLength(0);
  });
});
