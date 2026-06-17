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
  | { kind: "outside"; target: string } // escapes the clone root
  | { kind: "open"; note: NoteFile } // resolved to an existing note
  | { kind: "create"; relPath: string } // missing note inside the clone
  | { kind: "decline"; target: string }; // a non-note file we can't open

const EXTERNAL = /^[a-z][a-z\d+.-]*:/i;
const MD_EXT = /\.(md|markdown)$/i;
const ANY_EXT = /\.[a-z0-9]+$/i;
const WEB_SCHEME = /^https?:\/\//i;
// A bare host typed as a link — `example.com`, `sub.example.com/path` — no
// scheme, at least one dot, no whitespace. Excludes note extensions so
// `[[note.md]]` stays a note.
const BARE_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i;

/**
 * If `target` is a web address — an explicit `http(s)://` URL, or a bare host
 * like `example.com` — return a fully-qualified URL; else null. Lets
 * `[[example.com]]` and `[x](example.com)` open the browser instead of reading
 * as a missing note.
 */
export function webUrl(target: string): string | null {
  const t = target.trim();
  if (WEB_SCHEME.test(t)) return t;
  if (EXTERNAL.test(t)) return null; // another scheme (mailto:, …) — not http(s)
  if (BARE_HOST.test(t) && !MD_EXT.test(t)) return `https://${t}`;
  return null;
}

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
  // A leading `/` is treated as clone-root-relative (not OS-absolute).
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

  // A bare host typed as a link (`[[example.com]]`, `[x](example.com)`) → web,
  // not a missing note to create.
  const web = webUrl(target);
  if (web) return { kind: "external", url: web };

  // Bare name → global by-name (a `[[wiki-link]]` or extensionless reference).
  if (!target.includes("/") && !ANY_EXT.test(target)) {
    const byName = index.resolve(target);
    if (byName) return { kind: "open", note: byName };
  }

  const baseDir = fromRelPath.includes("/") ? fromRelPath.slice(0, fromRelPath.lastIndexOf("/")) : "";
  const rel = normalizeRelative(baseDir, target);
  if (!rel) return { kind: "outside", target };

  const note = index.resolvePath(rel);
  if (note) return { kind: "open", note };

  // Missing: a markdown/extensionless target inside the clone can be created;
  // anything else (a code file in another repo, etc.) we don't own — decline.
  if (MD_EXT.test(rel)) return { kind: "create", relPath: rel };
  if (!ANY_EXT.test(rel)) return { kind: "create", relPath: `${rel}.md` };
  return { kind: "decline", target };
}
