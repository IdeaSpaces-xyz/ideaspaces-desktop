import { describe, expect, it, vi } from "vitest";

// notes.ts imports the Tauri fs plugin at module top; stub it so the module
// loads under the node test environment. `slugify` is pure and touches none of
// it — the rest of notes.ts (listing/IO) needs Tauri and is out of unit scope.
vi.mock("@tauri-apps/plugin-fs", () => ({}));

import { slugify } from "./notes";

describe("slugify", () => {
  it("lowercases and hyphen-joins", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("strips punctuation and collapses separators", () => {
    expect(slugify("  Foo, Bar & Baz!  ")).toBe("foo-bar-baz");
    expect(slugify("a---b__c")).toBe("a-b-c");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugify("!!Edges!!")).toBe("edges");
  });

  it("falls back to 'untitled' when nothing survives", () => {
    expect(slugify("")).toBe("untitled");
    expect(slugify("！？")).toBe("untitled");
  });
});
