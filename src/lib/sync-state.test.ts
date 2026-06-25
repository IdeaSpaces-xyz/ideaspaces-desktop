import { describe, expect, it } from "vitest";
import { deriveSyncBadge } from "./sync-state";
import type { CloneStatus } from "./cli";

const status = (over: Partial<CloneStatus>): CloneStatus => ({
  branch: "main",
  ahead: 0,
  behind: 0,
  dirty: false,
  ...over,
});

describe("deriveSyncBadge", () => {
  it("synced when nothing is pending — silent, no verb", () => {
    const b = deriveSyncBadge(status({}));
    expect(b.kind).toBe("synced");
    expect(b.synced).toBe(true);
    expect(b.direction).toBe("none");
    expect(b.verb).toBe("");
  });

  it("ahead → push / Upload", () => {
    const b = deriveSyncBadge(status({ ahead: 2 }));
    expect(b.kind).toBe("ahead");
    expect(b.direction).toBe("push");
    expect(b.verb).toBe("Upload");
    expect(b.label).toBe("2 to upload");
  });

  it("dirty-only → uncommitted (still pushes up)", () => {
    const b = deriveSyncBadge(status({ dirty: true }));
    expect(b.kind).toBe("uncommitted");
    expect(b.direction).toBe("push");
    expect(b.verb).toBe("Upload");
    expect(b.label).toBe("uncommitted changes");
  });

  it("behind → pull / Download (the case the old editor seed ignored)", () => {
    const b = deriveSyncBadge(status({ behind: 3 }));
    expect(b.kind).toBe("behind");
    expect(b.direction).toBe("pull");
    expect(b.verb).toBe("Download");
    expect(b.label).toBe("3 to download");
  });

  it("ahead + behind → diverged / both / Sync", () => {
    const b = deriveSyncBadge(status({ ahead: 1, behind: 2 }));
    expect(b.kind).toBe("diverged");
    expect(b.direction).toBe("both");
    expect(b.verb).toBe("Sync");
    expect(b.label).toBe("1 to upload, 2 to download");
  });

  it("dirty + behind also diverges (local edits + remote work)", () => {
    const b = deriveSyncBadge(status({ dirty: true, behind: 1 }));
    expect(b.kind).toBe("diverged");
    expect(b.direction).toBe("both");
    expect(b.label).toBe("uncommitted changes, 1 to download");
  });

  it("ahead + dirty stays push, names both", () => {
    const b = deriveSyncBadge(status({ ahead: 2, dirty: true }));
    expect(b.direction).toBe("push");
    expect(b.kind).toBe("ahead");
    expect(b.label).toBe("2 to upload, uncommitted changes");
  });

  it("treats null ahead/behind (no upstream) as zero", () => {
    const b = deriveSyncBadge(status({ ahead: null, behind: null, dirty: false }));
    expect(b.synced).toBe(true);
  });
});
