import { describe, it, expect, vi } from "vitest";
import {
  rootDisplayPath,
  renderListing,
  escapeMarkdown,
  loadRootPreview,
} from "./local-root-preview";
import type { MentionEntry } from "../lib/cli";

// fs: pretend the first README candidate exists; content is irrelevant to the
// path assertions. cli.listFiles is only hit on the no-README fallback path.
vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: vi.fn(async (p: string) => p.endsWith("/README.md")),
  readTextFile: vi.fn(async () => "# hi"),
}));
vi.mock("../lib/cli", () => ({ listFiles: vi.fn(async () => []) }));

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

describe("escapeMarkdown", () => {
  it("neutralizes a filename that looks like a markdown link", () => {
    const out = escapeMarkdown("[Click here](https://evil.example)");
    expect(out).not.toContain("](");
    expect(out).toContain("\\[");
    expect(out).toContain("\\]");
    expect(out).toContain("\\(");
  });
  it("leaves an ordinary filename readable", () => {
    expect(escapeMarkdown("my-notes.md")).toBe("my-notes.md");
  });
  it("collapses newlines so a name can't inject a fake heading/rule", () => {
    const out = escapeMarkdown("a\n# Fake heading");
    expect(out).not.toContain("\n");
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
  it("escapes markdown-significant characters in entry names", () => {
    const md = renderListing("ref", [entry("[x](https://evil.example)", "file")]);
    expect(md).not.toContain("](https://evil.example)");
  });
  it("adds a hint only when truncated", () => {
    expect(renderListing("ref", [entry("a", "file")], false)).not.toContain("showing the first");
    expect(renderListing("ref", [entry("a", "file")], true)).toContain("showing the first");
  });
});

describe("loadRootPreview — README path composition", () => {
  it("uses just the filename for home's own README (not home/README.md)", async () => {
    const preview = await loadRootPreview("/Users/me/space", "/Users/me/space");
    expect(preview.node.path).toBe("README.md");
  });
  it("nests the README under a mounted root's relative path", async () => {
    const preview = await loadRootPreview("/Users/me/space/notes/ref", "/Users/me/space");
    expect(preview.node.path).toBe("notes/ref/README.md");
  });
  it("exposes the README's absolute path so the pane can edit it", async () => {
    const preview = await loadRootPreview("/Users/me/space", "/Users/me/space");
    expect(preview.readmePath).toBe("/Users/me/space/README.md");
  });
});
