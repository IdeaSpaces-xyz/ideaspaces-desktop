import type { CloneRecord, Space } from "./cli";

// A place the app can open and work in. `path` is the primary key — always
// present. `remote` is enrichment: present when the path is a clone bound to a
// space (synced), absent for a bare local-only folder. Local-only folders
// arrive in S2c; today every Location comes from a clone, so `remote` is always
// set. Keeping `path` primary is what lets later slices go path-native without
// re-plumbing every caller (see plans/desktop/local-first-shell.md).
export interface Location {
  path: string;
  remote?: {
    repo_id: string;
    namespace: string;
    slug: string;
    hostname: string | null;
  };
}

// Build a Location from the CLI clone record. The clone registry doesn't carry
// hostname, so enrich `remote.hostname` from the bound Space when it's known.
export function fromClone(clone: CloneRecord, space?: Space): Location {
  return {
    path: clone.path,
    remote: {
      repo_id: clone.repo_id,
      namespace: clone.namespace,
      slug: clone.slug,
      hostname: space?.hostname ?? null,
    },
  };
}

// Reconstruct the flat CloneRecord shape from a clone-backed Location — a bridge
// for surfaces that still key on repo_id and haven't gone path-native yet (they
// migrate in S2b/S2c). Throws if the Location has no remote; S2a callers always
// pass a clone-backed Location, so this can't fire until local-only folders land
// (S2c), which is when these surfaces stop needing the bridge.
export function toCloneRecord(location: Location): CloneRecord {
  if (!location.remote) {
    throw new Error("toCloneRecord: Location has no remote (local-only folders arrive in S2c)");
  }
  const { repo_id, namespace, slug } = location.remote;
  return { path: location.path, repo_id, namespace, slug };
}
