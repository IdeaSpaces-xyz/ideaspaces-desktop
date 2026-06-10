import { useCallback, useEffect, useState } from "react";
import { listAllNotes } from "../lib/notes";
import { buildWikiIndex, type WikiIndex } from "./wikiIndex";

const EMPTY: WikiIndex = { resolve: () => null };

/**
 * Clone-wide wiki-link index, built once per clone (and on `reload()` after
 * notes are created). Resolution is in-memory; the cost is one recursive
 * directory walk, no file content read.
 */
export function useWikiIndex(cloneDir: string) {
  const [index, setIndex] = useState<WikiIndex>(EMPTY);

  const reload = useCallback(async () => {
    try {
      setIndex(buildWikiIndex(await listAllNotes(cloneDir)));
    } catch {
      setIndex(EMPTY); // a failed walk just means nothing resolves — links read as missing
    }
  }, [cloneDir]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { index, reload };
}
