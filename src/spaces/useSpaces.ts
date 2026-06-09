import { useCallback, useEffect, useState } from "react";
import { listSpaces, type Space } from "../lib/cli";

type SpacesStatus = "loading" | "loaded" | "error";

export interface SpacesState {
  status: SpacesStatus;
  spaces: Space[];
  username?: string | null;
  error?: string;
}

/** Loads the signed-in user's spaces via the CLI sidecar (`ideaspaces repos`). */
export function useSpaces() {
  const [state, setState] = useState<SpacesState>({ status: "loading", spaces: [] });

  const reload = useCallback(async () => {
    setState((prev) => ({ ...prev, status: "loading" }));
    try {
      const result = await listSpaces();
      setState({ status: "loaded", spaces: result.repos, username: result.username });
    } catch (err) {
      setState({
        status: "error",
        spaces: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ...state, reload };
}
