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
      const [result, clones] = await Promise.all([listSpaces(), listClones()]);
      setState({
        status: "loaded",
        spaces: result.repos,
        clones,
        username: result.username,
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
