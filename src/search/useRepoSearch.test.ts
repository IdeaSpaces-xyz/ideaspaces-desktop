import { describe, expect, it } from "vitest";
import { mergeRankedHits } from "./useRepoSearch";
import type { RankedHit } from "./useRepoSearch";

const hit = (over: Partial<RankedHit> & { slug: string; path: string; score: number }): RankedHit => ({
  body_hits: 1,
  name_hits: 0,
  snippet: "",
  line: null,
  repoId: over.slug,
  clonePath: `/clones/${over.slug}`,
  ...over,
});

describe("mergeRankedHits", () => {
  it("interleaves repos by score, highest first", () => {
    const merged = mergeRankedHits([
      [hit({ slug: "a", path: "a/low.md", score: 1 }), hit({ slug: "a", path: "a/high.md", score: 9 })],
      [hit({ slug: "b", path: "b/mid.md", score: 5 })],
    ]);
    expect(merged.map((h) => `${h.slug}:${h.path}`)).toEqual([
      "a:a/high.md",
      "b:b/mid.md",
      "a:a/low.md",
    ]);
  });

  it("breaks score ties by path for a stable order", () => {
    const merged = mergeRankedHits([
      [hit({ slug: "z", path: "z.md", score: 3 })],
      [hit({ slug: "a", path: "a.md", score: 3 })],
    ]);
    expect(merged.map((h) => h.path)).toEqual(["a.md", "z.md"]);
  });

  it("caps the merged list at max", () => {
    const lists = [
      [
        hit({ slug: "a", path: "1.md", score: 5 }),
        hit({ slug: "a", path: "2.md", score: 4 }),
        hit({ slug: "a", path: "3.md", score: 3 }),
      ],
    ];
    expect(mergeRankedHits(lists, 2).map((h) => h.path)).toEqual(["1.md", "2.md"]);
  });

  it("handles empty input", () => {
    expect(mergeRankedHits([])).toEqual([]);
    expect(mergeRankedHits([[], []])).toEqual([]);
  });
});
