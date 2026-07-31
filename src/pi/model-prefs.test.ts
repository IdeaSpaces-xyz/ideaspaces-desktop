import { describe, it, expect } from "vitest";
import { visibleModels } from "./model-prefs";

const m = (ref: string) => ({ ref, name: ref });

describe("visibleModels (composer curation filter)", () => {
  it("returns all models when nothing is hidden", () => {
    const models = [m("a/1"), m("b/2")];
    expect(visibleModels(models, new Set())).toBe(models); // same ref — no needless copy
  });

  it("drops hidden refs", () => {
    const models = [m("a/1"), m("a/2"), m("b/3")];
    const shown = visibleModels(models, new Set(["a/2"]));
    expect(shown.map((x) => x.ref)).toEqual(["a/1", "b/3"]);
  });

  it("falls back to all models rather than showing an empty picker", () => {
    // Over-pruning everything would leave the composer unable to send — never do that.
    const models = [m("a/1"), m("b/2")];
    const shown = visibleModels(models, new Set(["a/1", "b/2"]));
    expect(shown).toEqual(models);
  });

  it("ignores hidden refs that aren't in the current list", () => {
    const models = [m("a/1")];
    expect(visibleModels(models, new Set(["gone/9"])).map((x) => x.ref)).toEqual(["a/1"]);
  });
});
