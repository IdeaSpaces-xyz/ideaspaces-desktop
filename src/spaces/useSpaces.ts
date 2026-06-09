import { useCallback, useEffect, useState } from "react";
import { listSpaces, type Space } from "../lib/cli";

type SpacesStatus = "loading" | "loaded" | "error";

export interface SpacesState {
  status: SpacesStatus;
  spaces: Space[];
  // null = no username (or not yet loaded); never undefined, so callers
  // distinguish "no username" without checking two falsy values.
  username: string | null;
  error?: string;
}

/** Loads the signed-in user's spaces via the CLI sidecar (`ideaspaces repos`). */
export function useSpaces() {
  const [state, setState] = useState<SpacesState>({
    status: "loading",
    spaces: [],
    username: null,
  });

  const reload = useCallback(async () => {
    setState((prev) => ({ ...prev, status: "loading" }));
    try {
      const result = await listSpaces();
      setState({ status: "loaded", spaces: result.repos, username: result.username });
    } catch (err) {
      setState({
        status: "error",
        spaces: [],
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
