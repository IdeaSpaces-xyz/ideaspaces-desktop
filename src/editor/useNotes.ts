import { useCallback, useEffect, useState } from "react";
import { listNotes, type NoteFile } from "../lib/notes";

type Status = "loading" | "loaded" | "error";

/** The markdown notes in a clone's working tree (fs-listed, recursive). */
export function useNotes(cloneDir: string) {
  const [status, setStatus] = useState<Status>("loading");
  const [notes, setNotes] = useState<NoteFile[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setStatus("loading");
    setError(undefined);
    try {
      setNotes(await listNotes(cloneDir));
      setStatus("loaded");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, [cloneDir]);

  useEffect(() => {
    void load();
  }, [load]);

  return { status, notes, error, reload: load };
}
