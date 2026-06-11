// Resolve `[[wiki-link]]` targets to notes in a clone — Obsidian-style matching
// by filename (case-insensitive), with `folder/name` paths supported. Built from
// a flat note list (see `listAllNotes`); pure so it's trivial to reason about.

import type { NoteFile } from "../lib/notes";

export interface WikiIndex {
  /** A note matched by bare filename (Obsidian-style `[[name]]`), or null. */
  resolve(target: string): NoteFile | null;
  /** A note matched by clone-relative path (folder → its README), or null. */
  resolvePath(relPath: string): NoteFile | null;
}

// Strip a `[[target|alias]]` alias and a `#heading`, a leading `./`, and the
// markdown extension — leaving the bare target the link points at. Atomic passes
// the target without the alias already; we strip defensively.
function cleanTarget(target: string): string {
  let t = target.trim();
  const bar = t.indexOf("|");
  if (bar !== -1) t = t.slice(0, bar);
  const hash = t.indexOf("#");
  if (hash !== -1) t = t.slice(0, hash);
  return t.trim().replace(/^\.\//, "").replace(/\.(md|markdown)$/i, "");
}

/** The note name to create for a missing target: its last segment, original case. */
export function wikiTargetName(target: string): string {
  const segs = cleanTarget(target).split("/");
  return (segs[segs.length - 1] ?? "").trim();
}

export function buildWikiIndex(notes: NoteFile[]): WikiIndex {
  const byName = new Map<string, NoteFile>();
  const byPath = new Map<string, NoteFile>();
  for (const n of notes) {
    const nameKey = n.name.toLowerCase();
    if (!byName.has(nameKey)) byName.set(nameKey, n); // first wins on duplicate names
    byPath.set(n.relPath.toLowerCase().replace(/\.(md|markdown)$/i, ""), n);
  }
  return {
    resolve(target) {
      const t = cleanTarget(target).toLowerCase();
      if (!t) return null;
      // A slash means a path from the clone root; otherwise match by name.
      if (t.includes("/")) return byPath.get(t) ?? null;
      return byName.get(t) ?? byPath.get(t) ?? null;
    },
    resolvePath(relPath) {
      const key = relPath.toLowerCase().replace(/\.(md|markdown)$/i, "");
      // Exact path, or a folder resolving to its README.
      return byPath.get(key) ?? byPath.get(`${key}/readme`) ?? null;
    },
  };
}
