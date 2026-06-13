// Raw note-file IO over a local clone, via the Tauri fs plugin.
//
// The editor edits file *content* only — listing, reading, writing markdown.
// Git (commit/push) stays in the CLI sidecar (see commitClone/syncClone). The
// fs capability is scoped to the home tree; macOS TCC gates protected folders.
//
// Listing is per-level (folders + files at one path), mirroring is_web v2's
// repo tree browser — you drill into folders rather than seeing every note flat.

import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  stat,
  writeTextFile,
  type DirEntry,
} from "@tauri-apps/plugin-fs";
import { parseFrontmatter } from "../editor/frontmatter";

export interface NoteFile {
  /** Absolute path on disk. */
  path: string;
  /** Path relative to the clone root (the git pathspec, POSIX separators). */
  relPath: string;
  /** Filename without extension (a slug). */
  name: string;
  /** Frontmatter `name` — the display title (verbatim), when present. */
  title?: string;
  /** Frontmatter `summary`, surfaced as the list subtitle (when present). */
  summary?: string;
}

export interface FolderEntry {
  /** Folder name (last path segment). */
  name: string;
  /** Path relative to the clone root (POSIX separators). */
  relPath: string;
  /** Count of markdown files directly inside (one level; best-effort). */
  fileCount: number;
}

export interface DirListing {
  folders: FolderEntry[];
  files: NoteFile[];
}

// Non-hidden directories we never descend into. Hidden dirs (.git, .obsidian, …)
// are skipped separately by the leading-dot check.
const SKIP_DIRS = new Set(["node_modules", "dist", "target"]);

function isMarkdown(name: string): boolean {
  return name.endsWith(".md") || name.endsWith(".markdown");
}

function baseName(name: string): string {
  return name.replace(/\.(md|markdown)$/, "");
}

function isHiddenOrSkipped(name: string): boolean {
  return name.startsWith(".") || SKIP_DIRS.has(name);
}

/** The `name` (title) and `summary` from a note's frontmatter, parsed once. */
function noteMeta(content: string): { title?: string; summary?: string } {
  const fm = parseFrontmatter(content);
  if (!fm) return {};
  const field = (key: string) =>
    fm.fields.find((f) => f.key.toLowerCase() === key)?.value || undefined;
  return { title: field("name"), summary: field("summary") };
}

/** Slug for a title — lowercase, alphanumeric, hyphen-joined; never empty. */
export function slugify(title: string): string {
  const s = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "untitled";
}

/** Count markdown files directly inside a folder (shallow; best-effort). */
async function countMarkdown(absDir: string): Promise<number> {
  try {
    const entries = await readDir(absDir);
    return entries.filter((e) => e.isFile && isMarkdown(e.name)).length;
  } catch {
    return 0;
  }
}

/**
 * List one level of a clone: sub-folders and the markdown notes directly in it.
 * `relPath` is "" for the clone root. Folders and files are sorted by name;
 * each note carries its frontmatter `summary` as a subtitle.
 *
 * Paths are joined with `/` — correct on the macOS/Linux desktop targets (v1
 * ships macOS first). Windows back-slash normalisation is a follow-up.
 */
export async function listDir(cloneDir: string, relPath: string): Promise<DirListing> {
  const root = cloneDir.replace(/\/+$/, "");
  const absDir = relPath ? `${root}/${relPath}` : root;
  const entries: DirEntry[] = await readDir(absDir);

  // Each entry's folder-count / summary read is independent — fan them out so a
  // folder with N notes is one round of parallel I/O, not N serial reads.
  const items = await Promise.all(
    entries.map(async (entry): Promise<{ folder?: FolderEntry; file?: NoteFile }> => {
      const rel = relPath ? `${relPath}/${entry.name}` : entry.name;
      const abs = `${absDir}/${entry.name}`;
      if (entry.isDirectory) {
        if (isHiddenOrSkipped(entry.name)) return {};
        return { folder: { name: entry.name, relPath: rel, fileCount: await countMarkdown(abs) } };
      }
      if (entry.isFile && isMarkdown(entry.name)) {
        const content = await readTextFile(abs).catch(() => "");
        return { file: { path: abs, relPath: rel, name: baseName(entry.name), ...noteMeta(content) } };
      }
      return {};
    }),
  );

  const folders = items.map((it) => it.folder).filter((f): f is FolderEntry => !!f);
  const files = items.map((it) => it.file).filter((f): f is NoteFile => !!f);
  folders.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));
  return { folders, files };
}

/**
 * Every markdown note in the clone, recursively (skipping hidden/build dirs).
 * No content is read — just path/relPath/name — so this is cheap enough to build
 * the wiki-link index on. Sub-folders are walked in parallel.
 */
export async function listAllNotes(cloneDir: string): Promise<NoteFile[]> {
  const root = cloneDir.replace(/\/+$/, "");
  const out: NoteFile[] = [];

  async function walk(absDir: string, relDir: string): Promise<void> {
    let entries: DirEntry[];
    try {
      entries = await readDir(absDir);
    } catch {
      return; // unreadable dir (permissions/TCC) — skip, don't abort the walk
    }
    const subdirs: Array<{ abs: string; rel: string }> = [];
    for (const entry of entries) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      const abs = `${absDir}/${entry.name}`;
      if (entry.isDirectory) {
        if (!isHiddenOrSkipped(entry.name)) subdirs.push({ abs, rel });
      } else if (entry.isFile && isMarkdown(entry.name)) {
        out.push({ path: abs, relPath: rel, name: baseName(entry.name) });
      }
    }
    await Promise.all(subdirs.map((d) => walk(d.abs, d.rel)));
  }

  await walk(root, "");
  return out;
}

export interface RecentNote extends NoteFile {
  /** Last-saved time (file mtime) in epoch ms; 0 when unavailable. */
  updatedAt: number;
}

/**
 * Every note in the clone with its last-saved mtime and frontmatter title/
 * summary, newest first — the data behind the Recent timeline. Walks like
 * listAllNotes, then reads + stats each file (in parallel across files).
 *
 * Uses file mtime ("last saved") rather than git commit time, by design: it
 * reflects local edits instantly and survives offline work. Reads each note's
 * full content for its title/summary (like listDir) — fine for typical spaces;
 * a head-only read is the follow-up if repos grow large.
 */
export async function listRecentNotes(cloneDir: string): Promise<RecentNote[]> {
  const notes = await listAllNotes(cloneDir);
  const enriched = await Promise.all(
    notes.map(async (n): Promise<RecentNote> => {
      let meta: { title?: string; summary?: string } = {};
      let updatedAt = 0;
      try {
        meta = noteMeta(await readTextFile(n.path));
      } catch {
        // Unreadable content — keep the path, skip title/summary.
      }
      try {
        const info = await stat(n.path);
        updatedAt = info.mtime ? info.mtime.getTime() : 0;
      } catch {
        // No mtime (permissions/TCC) — sorts to the bottom.
      }
      return { ...n, ...meta, updatedAt };
    }),
  );
  enriched.sort((a, b) => b.updatedAt - a.updatedAt);
  return enriched;
}

/** Read a note's raw content from disk. */
export function readNote(path: string): Promise<string> {
  return readTextFile(path);
}

/** Write a note's raw content to disk. */
export function writeNote(path: string, content: string): Promise<void> {
  return writeTextFile(path, content);
}

// Validate a user-typed name for a new note/folder: a single path segment, no
// separators / traversal / hidden-dotfiles. Keeps creation inside the folder
// the user is looking at.
function safeSegment(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name can't be empty.");
  if (/[/\\]/.test(trimmed) || trimmed.includes("..") || trimmed.startsWith(".")) {
    throw new Error("Name can't contain slashes or '..', or start with a dot.");
  }
  return trimmed;
}

/** Create a new sub-folder under `relPath`. Returns the new folder's relPath. */
export async function createFolder(cloneDir: string, relPath: string, name: string): Promise<string> {
  const seg = safeSegment(name);
  const rel = relPath ? `${relPath}/${seg}` : seg;
  const abs = `${cloneDir.replace(/\/+$/, "")}/${rel}`;
  if (await exists(abs)) throw new Error(`"${seg}" already exists.`);
  await mkdir(abs);
  return rel;
}

/**
 * Create a new, blank markdown note under `relPath` (`.md` appended if the user
 * didn't). Returns the new note so the caller can open it. Refuses to clobber
 * an existing file.
 */
export async function createNote(cloneDir: string, relPath: string, name: string): Promise<NoteFile> {
  let seg = safeSegment(name);
  if (!isMarkdown(seg)) seg += ".md";
  const rel = relPath ? `${relPath}/${seg}` : seg;
  const abs = `${cloneDir.replace(/\/+$/, "")}/${rel}`;
  if (await exists(abs)) throw new Error(`"${seg}" already exists.`);
  await writeTextFile(abs, "");
  return { path: abs, relPath: rel, name: baseName(seg) };
}

/** Find a free `<relDir>/<slug>.md` (…-2, …-3 on collision); `exclude` is the
 *  note's own current path, so renaming to the same slug is allowed. */
async function freeRelPath(
  cloneDir: string,
  relDir: string,
  slug: string,
  exclude?: string,
): Promise<string> {
  const root = cloneDir.replace(/\/+$/, "");
  const make = (s: string) => (relDir ? `${relDir}/${s}.md` : `${s}.md`);
  let candidate = make(slug);
  let n = 2;
  while (candidate !== exclude && (await exists(`${root}/${candidate}`))) {
    candidate = make(`${slug}-${n++}`);
  }
  return candidate;
}

/** Create a blank "Untitled" note (deduped) under `relDir`, ready to be titled. */
export async function createUntitledNote(cloneDir: string, relDir: string): Promise<NoteFile> {
  const rel = await freeRelPath(cloneDir, relDir, "untitled");
  const abs = `${cloneDir.replace(/\/+$/, "")}/${rel}`;
  await writeTextFile(abs, "");
  return { path: abs, relPath: rel, name: baseName(rel.slice(rel.lastIndexOf("/") + 1)) };
}

/**
 * Retitle a note: write `newContent` to a slugified filename in the same folder
 * and remove the old file if the path changed. `title` is the verbatim display
 * name (frontmatter `name`); the filename is its slug. Returns the new note.
 */
export async function renameNote(
  cloneDir: string,
  oldRelPath: string,
  title: string,
  newContent: string,
): Promise<NoteFile> {
  const root = cloneDir.replace(/\/+$/, "");
  const slash = oldRelPath.lastIndexOf("/");
  const relDir = slash === -1 ? "" : oldRelPath.slice(0, slash);
  const newRel = await freeRelPath(cloneDir, relDir, slugify(title), oldRelPath);
  const newAbs = `${root}/${newRel}`;
  await writeTextFile(newAbs, newContent);
  if (newRel !== oldRelPath) await remove(`${root}/${oldRelPath}`);
  return {
    path: newAbs,
    relPath: newRel,
    name: baseName(newRel.slice(newRel.lastIndexOf("/") + 1)),
    title,
  };
}
