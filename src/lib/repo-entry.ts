import type { CloneRecord, CloneStatus, Space } from "./cli";
import { deriveSyncBadge, type SyncBadge } from "./sync-state";

// One descriptor per repo, joining what the remote knows (Space) with what's on
// disk (CloneRecord) + its sync state — so location stops being inferred ad-hoc
// from `cloneIndex.has(...)` scattered through the rail. Location follows the
// cloud-storage idiom (available offline / online-only); sync overlays it.

export type RepoLocation =
  | "online-only" // a Space the user hasn't made available offline (no clone)
  | "available" // on disk and bound to a known Space
  | "local-only"; // on disk but no Space we can see (orphan / lost access)

export interface RepoEntry {
  repoId: string;
  slug: string;
  location: RepoLocation;
  space?: Space; // absent only for local-only
  clone?: CloneRecord; // present when on disk (available | local-only)
  sync?: SyncBadge; // present when on disk and a git status is known
  statusFailed: boolean; // status fetch failed — show "unknown", never "synced"
}

export interface RepoEntries {
  /** Repos in the active context — online-only or available. */
  inContext: RepoEntry[];
  /** Clones outside the active context (or with no Space): the "On this
   *  device" group, so a repo you have offline is never lost behind a filter. */
  onDevice: RepoEntry[];
}

interface DeriveArgs {
  visibleSpaces: Space[];
  allSpaces: Space[];
  clones: CloneRecord[];
  statuses: Record<string, CloneStatus>;
  failed: Set<string>;
}

export function deriveRepoEntries({
  visibleSpaces,
  allSpaces,
  clones,
  statuses,
  failed,
}: DeriveArgs): RepoEntries {
  const cloneByRepo = new Map(clones.map((c) => [c.repo_id, c]));
  const spaceByRepo = new Map(allSpaces.map((s) => [s.repo_id, s]));
  const visibleIds = new Set(visibleSpaces.map((s) => s.repo_id));

  const syncOf = (repoId: string): SyncBadge | undefined => {
    const status = statuses[repoId];
    return status ? deriveSyncBadge(status) : undefined;
  };

  const inContext: RepoEntry[] = visibleSpaces.map((space) => {
    const clone = cloneByRepo.get(space.repo_id);
    return {
      repoId: space.repo_id,
      slug: space.slug,
      location: clone ? "available" : "online-only",
      space,
      clone,
      sync: clone ? syncOf(space.repo_id) : undefined,
      statusFailed: failed.has(space.repo_id),
    };
  });

  // Clones the active context doesn't already show — bound to a Space in another
  // context (still "available", just elsewhere) or to no visible Space at all
  // (a true "local-only" orphan).
  const onDevice: RepoEntry[] = clones
    .filter((c) => !visibleIds.has(c.repo_id))
    .map((clone) => {
      const space = spaceByRepo.get(clone.repo_id);
      return {
        repoId: clone.repo_id,
        slug: space?.slug ?? clone.slug,
        location: space ? "available" : "local-only",
        space,
        clone,
        sync: syncOf(clone.repo_id),
        statusFailed: failed.has(clone.repo_id),
      };
    });

  return { inContext, onDevice };
}
