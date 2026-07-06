import { describe, expect, it } from "vitest";
import { fromClone, toCloneRecord, type Location } from "./location";
import type { CloneRecord, Space } from "./cli";

const clone: CloneRecord = {
  path: "/Users/x/IdeaSpaces/roadmap",
  repo_id: "repo_123",
  slug: "roadmap",
  namespace: "ideaspaces.xyz",
};

const space: Space = {
  repo_id: "repo_123",
  slug: "roadmap",
  hostname: "acme.com",
  role: "owner",
  member_count: 3,
};

describe("fromClone", () => {
  it("keeps path primary and fills remote from the clone", () => {
    expect(fromClone(clone)).toEqual({
      path: "/Users/x/IdeaSpaces/roadmap",
      remote: { repo_id: "repo_123", namespace: "ideaspaces.xyz", slug: "roadmap", hostname: null },
    });
  });

  it("enriches remote.hostname from the bound space", () => {
    expect(fromClone(clone, space).remote?.hostname).toBe("acme.com");
  });
});

describe("toCloneRecord", () => {
  it("round-trips a clone-backed Location back to the flat shape", () => {
    expect(toCloneRecord(fromClone(clone))).toEqual(clone);
  });

  it("throws for a local-only Location (no remote)", () => {
    const local: Location = { path: "/Users/x/notes" };
    expect(() => toCloneRecord(local)).toThrow(/no remote/);
  });
});
