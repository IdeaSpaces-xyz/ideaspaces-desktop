import { useCallback, useEffect, useState } from "react";
import { cloneStatus, type CloneRecord, type CloneStatus } from "../lib/cli";

/**
 * Per-clone git status, keyed by repo_id. Loads without fetching on mount /
 * when the clone set changes (cheap, last-known remote-tracking); `refresh()`
 * re-loads with `--fetch` to update ahead/behind against the real remote.
 */
export function useCloneStatuses(clones: CloneRecord[]) {
  const [statuses, setStatuses] = useState<Record<string, CloneStatus>>({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (fetch: boolean) => {
      if (fetch) setRefreshing(true);
      const results = await Promise.allSettled(
        clones.map(async (c) => [c.repo_id, await cloneStatus(c.path, fetch)] as const),
      );
      const next: Record<string, CloneStatus> = {};
      for (const r of results) {
        if (r.status === "fulfilled") next[r.value[0]] = r.value[1];
      }
      setStatuses(next);
      if (fetch) setRefreshing(false);
    },
    [clones],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  return { statuses, refreshing, refresh: () => load(true) };
}
