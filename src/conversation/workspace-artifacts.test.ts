import { describe, expect, it } from "vitest";
import {
  deriveWorkspaceGroups,
  workspaceArtifactCount,
  workspaceIsEmpty,
} from "./workspace-artifacts";

const ws = (over: Partial<Record<"created" | "modified" | "deleted" | "read" | "mentioned", string[]>>) => ({
  created: [],
  modified: [],
  deleted: [],
  read: [],
  mentioned: [],
  ...over,
});

describe("deriveWorkspaceGroups", () => {
  it("groups created / modified / referenced (read + mentioned)", () => {
    const g = deriveWorkspaceGroups(ws({ created: ["a"], modified: ["b"], read: ["c"], mentioned: ["d"] }));
    expect(g).toEqual({ created: ["a"], modified: ["b"], referenced: ["c", "d"] });
  });

  it("prioritises created > modified > referenced for a node in several", () => {
    // 'a' created + modified + read → only in created; 'b' modified + mentioned → modified.
    const g = deriveWorkspaceGroups(
      ws({ created: ["a"], modified: ["a", "b"], read: ["a"], mentioned: ["b"] }),
    );
    expect(g).toEqual({ created: ["a"], modified: ["b"], referenced: [] });
  });

  it("drops deleted nodes from every group", () => {
    const g = deriveWorkspaceGroups(ws({ created: ["a"], modified: ["b"], deleted: ["a"], read: ["b"] }));
    expect(g).toEqual({ created: [], modified: ["b"], referenced: [] });
  });

  it("workspaceIsEmpty reflects an all-empty surface", () => {
    expect(workspaceIsEmpty(deriveWorkspaceGroups(ws({})))).toBe(true);
    expect(workspaceIsEmpty(deriveWorkspaceGroups(ws({ created: ["a"] })))).toBe(false);
  });

  it("workspaceArtifactCount sums distinct notes across groups", () => {
    expect(workspaceArtifactCount(deriveWorkspaceGroups(ws({})))).toBe(0);
    // 'a' created + read dedupes to created only → counted once; +b, +c = 3.
    const g = deriveWorkspaceGroups(ws({ created: ["a"], modified: ["b"], read: ["a", "c"] }));
    expect(workspaceArtifactCount(g)).toBe(3);
  });
});
