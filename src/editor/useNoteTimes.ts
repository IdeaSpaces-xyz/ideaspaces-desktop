import { useEffect, useRef, useState } from "react";
import { noteTimes } from "../lib/cli";

export interface NoteTimeEntry {
  createdAt: number;
  updatedAt: number;
}

/**
 * The clone's per-note git created/updated times, keyed by repo-relative path —
 * the data behind the note-list date sort. Loaded once per clone (one cheap
 * `git log` pass via the CLI) and cached, so switching folders re-sorts without
 * re-shelling git. Empty map until it resolves, or on error (date sorts then
 * fall back to "no date" ordering rather than failing the list).
 */
export function useNoteTimes(clonePath: string): Map<string, NoteTimeEntry> {
  const [map, setMap] = useState<Map<string, NoteTimeEntry>>(new Map());
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (loadedFor.current === clonePath) return;
    loadedFor.current = clonePath;
    setMap(new Map());
    let alive = true;
    noteTimes(clonePath)
      .then((times) => {
        if (!alive) return;
        const next = new Map<string, NoteTimeEntry>();
        for (const t of times) next.set(t.path, { createdAt: t.created_at, updatedAt: t.updated_at });
        setMap(next);
      })
      .catch(() => {
        if (alive) setMap(new Map());
      });
    return () => {
      alive = false;
    };
  }, [clonePath]);

  return map;
}
