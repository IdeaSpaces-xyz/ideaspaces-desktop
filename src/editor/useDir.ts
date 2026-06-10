import { useCallback, useEffect, useState } from "react";
import { listDir, type DirListing } from "../lib/notes";

type Status = "loading" | "loaded" | "error";

const EMPTY: DirListing = { folders: [], files: [] };

/** One level of a clone's working tree (folders + notes at `relPath`). */
export function useDir(cloneDir: string, relPath: string) {
  const [status, setStatus] = useState<Status>("loading");
  const [listing, setListing] = useState<DirListing>(EMPTY);
  const [error, setError] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setStatus("loading");
    setError(undefined);
    try {
      setListing(await listDir(cloneDir, relPath));
      setStatus("loaded");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, [cloneDir, relPath]);

  useEffect(() => {
    void load();
  }, [load]);

  return { status, folders: listing.folders, files: listing.files, error, reload: load };
}
