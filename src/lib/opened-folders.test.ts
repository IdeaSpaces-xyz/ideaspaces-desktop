import { describe, expect, it } from "vitest";
import { isInsideHome, promoteFolder, withoutFolder } from "./opened-folders";

describe("isInsideHome", () => {
  const home = "/Users/bob";
  it("accepts the home dir itself and its descendants", () => {
    expect(isInsideHome(home, home)).toBe(true);
    expect(isInsideHome("/Users/bob/notes/journal", home)).toBe(true);
  });
  it("tolerates a trailing slash on home", () => {
    expect(isInsideHome("/Users/bob/notes", "/Users/bob/")).toBe(true);
  });
  it("rejects a sibling that shares a prefix (bob vs bobby)", () => {
    expect(isInsideHome("/Users/bobby/notes", home)).toBe(false);
  });
  it("rejects paths outside home", () => {
    expect(isInsideHome("/Volumes/ext/notes", home)).toBe(false);
    expect(isInsideHome("/tmp", home)).toBe(false);
  });
});

describe("promoteFolder", () => {
  it("prepends a new folder", () => {
    expect(promoteFolder(["/a", "/b"], "/c")).toEqual(["/c", "/a", "/b"]);
  });

  it("moves an existing folder to the front (no duplicate)", () => {
    expect(promoteFolder(["/a", "/b", "/c"], "/c")).toEqual(["/c", "/a", "/b"]);
  });

  it("is a no-op-shaped move when it's already first", () => {
    expect(promoteFolder(["/a", "/b"], "/a")).toEqual(["/a", "/b"]);
  });
});

describe("withoutFolder", () => {
  it("removes the folder", () => {
    expect(withoutFolder(["/a", "/b", "/c"], "/b")).toEqual(["/a", "/c"]);
  });

  it("leaves the list unchanged when absent", () => {
    expect(withoutFolder(["/a", "/b"], "/z")).toEqual(["/a", "/b"]);
  });
});
