import { describe, it, expect } from "vitest";
import { visibleModels, collapseSnapshots, groupByProvider } from "./model-prefs";

const m = (ref: string) => ({ ref, name: ref });
const pm = (provider: string, id: string) => ({ provider, id, ref: `${provider}/${id}` });

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

describe("collapseSnapshots (drop dated pins when the alias is present)", () => {
  it("drops a dated snapshot when its base alias exists", () => {
    const models = [pm("anthropic", "claude-opus-4-5"), pm("anthropic", "claude-opus-4-5-20251101")];
    expect(collapseSnapshots(models).map((x) => x.id)).toEqual(["claude-opus-4-5"]);
  });

  it("keeps a dated id when there's no alias to fold into", () => {
    const models = [pm("anthropic", "claude-opus-4-5-20251101")];
    expect(collapseSnapshots(models).map((x) => x.id)).toEqual(["claude-opus-4-5-20251101"]);
  });

  it("keeps non-dated ids (e.g. gpt-5.6 variants) untouched", () => {
    const models = [pm("openai-codex", "gpt-5.6-luna"), pm("openai-codex", "gpt-5.6-sol")];
    expect(collapseSnapshots(models).map((x) => x.id)).toEqual(["gpt-5.6-luna", "gpt-5.6-sol"]);
  });

  it("only folds within the same provider", () => {
    const models = [pm("a", "x-20250101"), pm("b", "x")]; // different providers → no fold
    expect(collapseSnapshots(models).length).toBe(2);
  });
});

describe("groupByProvider", () => {
  it("groups preserving first-seen provider order", () => {
    const models = [pm("anthropic", "a"), pm("openai-codex", "b"), pm("anthropic", "c")];
    const groups = groupByProvider(models);
    expect(groups.map(([p]) => p)).toEqual(["anthropic", "openai-codex"]);
    expect(groups[0][1].map((x) => x.id)).toEqual(["a", "c"]);
  });
});
