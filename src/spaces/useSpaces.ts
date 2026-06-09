import { useCallback, useEffect, useState } from "react";
import { listClones, listSpaces, type CloneRecord, type Space } from "../lib/cli";

type SpacesStatus = "loading" | "loaded" | "error";

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
        spaces: spacesResult.value.repos,
        clones: clonesResult.status === "fulfilled" ? clonesResult.value : [],
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
