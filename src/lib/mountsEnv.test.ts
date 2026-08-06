import { describe, it, expect } from "vitest";
import { mountsToEnv } from "./cli";

describe("mountsToEnv (IS_MOUNTS wiring for a local turn)", () => {
  it("comma-joins mounts into IS_MOUNTS", () => {
    expect(mountsToEnv(["/a", "/b/c"])).toEqual({ IS_MOUNTS: "/a,/b/c" });
  });

  it("omits IS_MOUNTS entirely when there are no mounts", () => {
    expect(mountsToEnv([])).toEqual({});
    expect(mountsToEnv(undefined)).toEqual({});
  });

  it("drops falsy entries", () => {
    expect(mountsToEnv(["/a", "", "/b"])).toEqual({ IS_MOUNTS: "/a,/b" });
  });
});
