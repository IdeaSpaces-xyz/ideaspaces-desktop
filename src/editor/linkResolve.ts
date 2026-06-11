// Classify a clicked link in a note. Markdown links (`[text](target)`) are file
// paths relative to the note they sit in — so we resolve against that note's
// directory, URL-decode (`%20` etc.), and only treat in-clone `.md`/extensionless
// targets as notes. A bare name (no slash/extension) is also tried as a global
// wiki-style name first (Obsidian `[[name]]`). Links that escape the clone root
// (e.g. `../../other-repo/file.ts`) or point at non-note files are declined, not
// offered as "create" — we don't own them.

import type { NoteFile } from "../lib/notes";
import type { WikiIndex } from "./wikiIndex";

export type LinkAction =
  | { kind: "external"; url: string } // http(s)/mailto/… → OS browser
  | { kind: "anchor" } // pure `#fragment` → in-document, nothing to navigate yet
  | { kind: "outside" } // escapes the clone root
  | { kind: "open"; note: NoteFile } // resolved to an existing note
  | { kind: "create"; relPath: string } // missing note inside the clone
  | { kind: "decline"; target: string }; // a non-note file we can't open

const EXTERNAL = /^[a-z][a-z\d+.-]*:/i;
const MD_EXT = /\.(md|markdown)$/i;
const ANY_EXT = /\.[a-z0-9]+$/i;

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s; // malformed escape — use it raw
  }
}

/**
 * Normalize `target` against `baseDir` (the directory of the note the link sits
 * in), collapsing `.` / `..`. Returns the clone-root-relative path, or null if
 * it escapes the clone root.
 */
export function normalizeRelative(baseDir: string, target: string): string | null {
  const parts = target.startsWith("/") ? [] : baseDir.split("/").filter(Boolean);
  for (const seg of target.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) return null; // escaped the clone root
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return parts.join("/");
}

export function classifyLink(url: string, fromRelPath: string, index: WikiIndex): LinkAction {
  if (EXTERNAL.test(url)) return { kind: "external", url };

  const target = decode(url).split("#")[0].split("|")[0].trim();
  if (!target) return { kind: "anchor" };

  // Bare name → global by-name (a `[[wiki-link]]` or extensionless reference).
  if (!target.includes("/") && !ANY_EXT.test(target)) {
    const byName = index.resolve(target);
    if (byName) return { kind: "open", note: byName };
  }

  const baseDir = fromRelPath.includes("/") ? fromRelPath.slice(0, fromRelPath.lastIndexOf("/")) : "";
  const rel = normalizeRelative(baseDir, target);
  if (!rel) return { kind: "outside" };

  const note = index.resolvePath(rel);
  if (note) return { kind: "open", note };

  // Missing: a markdown/extensionless target inside the clone can be created;
  // anything else (a code file in another repo, etc.) we don't own — decline.
  if (MD_EXT.test(rel)) return { kind: "create", relPath: rel };
  if (!ANY_EXT.test(rel)) return { kind: "create", relPath: `${rel}.md` };
  return { kind: "decline", target };
}
