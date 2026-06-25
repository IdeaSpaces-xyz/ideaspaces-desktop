import { describe, expect, it } from "vitest";
import { deriveRepoEntries } from "./repo-entry";
import type { CloneRecord, CloneStatus, Space } from "./cli";

const space = (over: Partial<Space>): Space => ({
  repo_id: "r",
  slug: "repo",
  hostname: null,
  role: "owner",
  member_count: 1,
  ...over,
});
const clone = (over: Partial<CloneRecord>): CloneRecord => ({
  path: "/x",
  repo_id: "r",
  slug: "repo",
  namespace: "ns",
  ...over,
});
const status = (over: Partial<CloneStatus>): CloneStatus => ({
  branch: "main",
  ahead: 0,
  behind: 0,
  dirty: false,
  ...over,
});

describe("deriveRepoEntries", () => {
  it("classifies a visible space with no clone as online-only", () => {
    const { inContext, onDevice } = deriveRepoEntries({
      visibleSpaces: [space({ repo_id: "a", slug: "alpha" })],
      allSpaces: [space({ repo_id: "a", slug: "alpha" })],
      clones: [],
      statuses: {},
      failed: new Set(),
    });
    expect(inContext).toHaveLength(1);
    expect(inContext[0].location).toBe("online-only");
    expect(inContext[0].clone).toBeUndefined();
    expect(inContext[0].sync).toBeUndefined();
    expect(onDevice).toHaveLength(0);
  });

  it("classifies a visible space with a clone as available, with sync overlay", () => {
    const { inContext } = deriveRepoEntries({
      visibleSpaces: [space({ repo_id: "a" })],
      allSpaces: [space({ repo_id: "a" })],
      clones: [clone({ repo_id: "a" })],
      statuses: { a: status({ ahead: 2 }) },
      failed: new Set(),
    });
    expect(inContext[0].location).toBe("available");
    expect(inContext[0].sync?.verb).toBe("Upload");
  });

  it("surfaces an out-of-context clone under onDevice (still available)", () => {
    // Viewing Personal (space 'a'); 'b' is an org repo cloned but filtered out.
    const { inContext, onDevice } = deriveRepoEntries({
      visibleSpaces: [space({ repo_id: "a", slug: "alpha" })],
      allSpaces: [
        space({ repo_id: "a", slug: "alpha" }),
        space({ repo_id: "b", slug: "beta", hostname: "acme.com" }),
      ],
      clones: [clone({ repo_id: "b", slug: "beta" })],
      statuses: {},
      failed: new Set(),
    });
    expect(inContext.map((e) => e.repoId)).toEqual(["a"]);
    expect(onDevice).toHaveLength(1);
    expect(onDevice[0].repoId).toBe("b");
    expect(onDevice[0].location).toBe("available"); // it has a Space, just elsewhere
    expect(onDevice[0].slug).toBe("beta");
  });

  it("classifies a clone with no known Space as local-only", () => {
    const { onDevice } = deriveRepoEntries({
      visibleSpaces: [],
      allSpaces: [],
      clones: [clone({ repo_id: "orphan", slug: "orphan" })],
      statuses: {},
      failed: new Set(),
    });
    expect(onDevice).toHaveLength(1);
    expect(onDevice[0].location).toBe("local-only");
    expect(onDevice[0].space).toBeUndefined();
    expect(onDevice[0].slug).toBe("orphan");
  });

  it("marks statusFailed so the row shows unknown, not synced", () => {
    const { inContext } = deriveRepoEntries({
      visibleSpaces: [space({ repo_id: "a" })],
      allSpaces: [space({ repo_id: "a" })],
      clones: [clone({ repo_id: "a" })],
      statuses: {},
      failed: new Set(["a"]),
    });
    expect(inContext[0].statusFailed).toBe(true);
    expect(inContext[0].sync).toBeUndefined();
  });
});
