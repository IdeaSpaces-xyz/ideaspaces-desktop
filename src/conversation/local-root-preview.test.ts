import { describe, it, expect } from "vitest";
import { rootDisplayPath, renderListing } from "./local-root-preview";
import type { MentionEntry } from "../lib/cli";

const entry = (name: string, kind: MentionEntry["kind"], path = name): MentionEntry => ({
  name,
  path,
  kind,
});

describe("rootDisplayPath", () => {
  it("returns home's basename for home itself", () => {
    expect(rootDisplayPath("/Users/me/space", "/Users/me/space")).toBe("space");
  });
  it("returns the path relative to home for a nested root", () => {
    expect(rootDisplayPath("/Users/me/space/notes/ref", "/Users/me/space")).toBe("notes/ref");
  });
  it("tolerates a trailing slash on home", () => {
    expect(rootDisplayPath("/Users/me/space/notes", "/Users/me/space/")).toBe("notes");
  });
  it("falls back to the absolute path when the root is outside home", () => {
    expect(rootDisplayPath("/other/place", "/Users/me/space")).toBe("/other/place");
  });
});

describe("renderListing", () => {
  it("renders an empty-folder note", () => {
    expect(renderListing("ref", [])).toContain("_This folder is empty._");
  });
  it("lists entries with a per-kind marker", () => {
    const md = renderListing("ref", [
      entry("sub", "folder"),
      entry("lib", "code-repo"),
      entry("notes.md", "file"),
    ]);
    expect(md).toContain("# ref");
    expect(md).toContain("📁 sub");
    expect(md).toContain("📦 lib");
    expect(md).toContain("📄 notes.md");
  });
});
