import { describe, it, expect } from "vitest";
import { mergeFiles, groupFiles, dropFiles, orphanKeys, type FileMap } from "./conversation-files";

describe("mergeFiles (strongest kind wins)", () => {
  it("adds new paths", () => {
    expect(mergeFiles({}, [{ path: "/a", kind: "mentioned" }])).toEqual({ "/a": "mentioned" });
  });
  it("upgrades a path to a stronger kind (mentioned → edited)", () => {
    const cur: FileMap = { "/a": "mentioned" };
    expect(mergeFiles(cur, [{ path: "/a", kind: "edited" }])).toEqual({ "/a": "edited" });
  });
  it("does not downgrade (edited stays edited when read arrives)", () => {
    const cur: FileMap = { "/a": "edited" };
    expect(mergeFiles(cur, [{ path: "/a", kind: "read" }])).toEqual({ "/a": "edited" });
  });
  it("does not mutate the input map", () => {
    const cur: FileMap = { "/a": "read" };
    mergeFiles(cur, [{ path: "/b", kind: "mentioned" }]);
    expect(cur).toEqual({ "/a": "read" });
  });
});

describe("groupFiles", () => {
  it("splits by kind, each group sorted", () => {
    const map: FileMap = {
      "/z": "edited",
      "/a": "edited",
      "/m": "read",
      "/x": "mentioned",
    };
    expect(groupFiles(map)).toEqual({
      edited: ["/a", "/z"],
      read: ["/m"],
      mentioned: ["/x"],
    });
  });
});

describe("dropFiles", () => {
  it("removes the given paths", () => {
    const cur: FileMap = { "/a": "read", "/b": "edited", "/c": "mentioned" };
    expect(dropFiles(cur, ["/b"])).toEqual({ "/a": "read", "/c": "mentioned" });
  });
  it("returns the same map when nothing to drop", () => {
    const cur: FileMap = { "/a": "read" };
    expect(dropFiles(cur, [])).toBe(cur);
  });
  it("ignores paths that aren't present", () => {
    expect(dropFiles({ "/a": "read" }, ["/gone"])).toEqual({ "/a": "read" });
  });
});

describe("orphanKeys (GC sweep)", () => {
  const keys = ["/ctx::a", "/ctx::b", "/ctx::c", "/other::a"];
  it("returns this-context keys whose id isn't live", () => {
    expect(orphanKeys(keys, "/ctx", ["a", "c"])).toEqual(["/ctx::b"]);
  });
  it("never touches another context's keys", () => {
    // 'a' is not live in /ctx, but /other::a must be left alone.
    expect(orphanKeys(keys, "/ctx", [])).toEqual(["/ctx::a", "/ctx::b", "/ctx::c"]);
  });
  it("returns nothing when all ids are live", () => {
    expect(orphanKeys(keys, "/ctx", ["a", "b", "c"])).toEqual([]);
  });
});
