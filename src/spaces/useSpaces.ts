import { useCallback, useEffect, useState } from "react";
import { listClones, listSpaces, type CloneRecord, type Space } from "../lib/cli";

type SpacesStatus = "loading" | "loaded" | "error";

/** Drop duplicate rows by repo_id, keeping first occurrence. The API can return
 *  the same repo twice (e.g. surfaced under two memberships); a repo maps to one
 *  context, so a dup is never a distinct row — it only breaks React list keys
 *  (duplicate-key warning) downstream. Dedupe once, at the source. */
function dedupeByRepoId<T extends { repo_id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((it) => {
    if (seen.has(it.repo_id)) return false;
    seen.add(it.repo_id);
    return true;
  });
}

export interface SpacesState {
  status: SpacesStatus;
  spaces: Space[];
  /** Local clone registry (folder ↔ space), joined with spaces by repo_id. */
  clones: CloneRecord[];
  // null = no username (or not yet loaded); never undefined, so callers
  // distinguish "no username" without checking two falsy values.
  username: string | null;
  error?: string;
}

/** Loads the user's spaces and the local clone registry via the CLI sidecar. */
export function useSpaces() {
  const [state, setState] = useState<SpacesState>({
    status: "loading",
    spaces: [],
    clones: [],
    username: null,
  });

  const reload = useCallback(async () => {
    setState((prev) => ({ ...prev, status: "loading" }));
    try {
      // Spaces are required; the clone registry is supplementary — a clones
      // failure shouldn't hide the user's spaces (it just drops local badges).
      const [spacesResult, clonesResult] = await Promise.allSettled([
        listSpaces(),
        listClones(),
      ]);
      if (spacesResult.status === "rejected") throw spacesResult.reason;
      setState({
        status: "loaded",
        spaces: dedupeByRepoId(spacesResult.value.repos),
        clones: clonesResult.status === "fulfilled" ? dedupeByRepoId(clonesResult.value) : [],
        username: spacesResult.value.username,
      });
    } catch (err) {
      setState({
        status: "error",
        spaces: [],
        clones: [],
        username: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ...state, reload };
}
