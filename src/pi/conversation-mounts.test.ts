import { describe, it, expect } from "vitest";
import { isValidMountPath, applyMount, dropMount } from "./conversation-mounts";

describe("isValidMountPath (IS_MOUNTS is comma-delimited)", () => {
  it("accepts a normal absolute path", () => {
    expect(isValidMountPath("/home/me/notes")).toBe(true);
  });
  it("rejects a path containing a comma", () => {
    // A comma would split into two bogus IS_MOUNTS entries pi then skips.
    expect(isValidMountPath("/home/me/a,b")).toBe(false);
  });
  it("rejects empty / whitespace-only", () => {
    expect(isValidMountPath("")).toBe(false);
    expect(isValidMountPath("   ")).toBe(false);
  });
});

describe("applyMount / dropMount (pure reducers)", () => {
  it("appends a new mount, preserving order", () => {
    expect(applyMount(["/a"], "/b")).toEqual(["/a", "/b"]);
  });
  it("is a no-op when the mount is already present (same ref)", () => {
    const cur = ["/a", "/b"];
    expect(applyMount(cur, "/a")).toBe(cur);
  });
  it("removes a mount", () => {
    expect(dropMount(["/a", "/b"], "/a")).toEqual(["/b"]);
  });
  it("dropping an absent mount leaves the set unchanged", () => {
    expect(dropMount(["/a"], "/gone")).toEqual(["/a"]);
  });
});
