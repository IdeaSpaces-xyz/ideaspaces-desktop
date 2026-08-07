import { describe, it, expect } from "vitest";
import { mergeFiles, groupFiles, type FileMap } from "./conversation-files";

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
