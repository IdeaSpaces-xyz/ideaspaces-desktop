import { describe, expect, it } from "vitest";
import { promoteFolder, withoutFolder } from "./opened-folders";

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
