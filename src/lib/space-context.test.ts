import { describe, expect, it } from "vitest";
import { folderContext } from "./space-context";

describe("folderContext", () => {
  it("labels with the last path segment", () => {
    const ctx = folderContext("/Users/x/notes/journal");
    expect(ctx).toEqual({
      kind: "folder",
      ref: "folder:/Users/x/notes/journal",
      label: "journal",
      hostname: null,
      path: "/Users/x/notes/journal",
    });
  });

  it("strips a trailing slash before taking the segment", () => {
    expect(folderContext("/Users/x/notes/").label).toBe("notes");
  });

  it("falls back to the path for a root-ish path with no segment", () => {
    expect(folderContext("/").label).toBe("/");
  });
});
