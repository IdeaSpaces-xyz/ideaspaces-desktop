import { useCallback, useEffect, useState } from "react";
import { listRecentNotes, type RecentNote } from "../lib/notes";

type Status = "idle" | "loading" | "loaded" | "error";

/**
 * The clone's notes ordered by last-saved mtime, for the Recent timeline.
 * Loaded lazily — only fetches while `enabled` (the Recent view is active) — and
 * re-fetches whenever it re-enables, so reopening Recent after an edit reflects
 * the new mtime (the note jumps to the top).
 */
export function useRecentNotes(cloneDir: string, enabled: boolean) {
  const [status, setStatus] = useState<Status>("idle");
  const [notes, setNotes] = useState<RecentNote[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setStatus("loading");
    setError(undefined);
    try {
      setNotes(await listRecentNotes(cloneDir));
      setStatus("loaded");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, [cloneDir]);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  return { status, notes, error, reload: load };
}
