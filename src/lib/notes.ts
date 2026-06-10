// Raw note-file IO over a local clone, via the Tauri fs plugin.
//
// The editor edits file *content* only — listing, reading, writing markdown.
// Git (commit/push) stays in the CLI sidecar (see commitClone/syncClone). The
// fs capability is scoped to the home tree; macOS TCC gates protected folders.
//
// Listing is per-level (folders + files at one path), mirroring is_web v2's
// repo tree browser — you drill into folders rather than seeing every note flat.

import { readDir, readTextFile, writeTextFile, type DirEntry } from "@tauri-apps/plugin-fs";
import { parseFrontmatter } from "../editor/frontmatter";

export interface NoteFile {
  /** Absolute path on disk. */
  path: string;
  /** Path relative to the clone root (the git pathspec, POSIX separators). */
  relPath: string;
  /** Display name — the filename without extension. */
  name: string;
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

/** Frontmatter `summary` for a note's content, or undefined when absent. */
function noteSummary(content: string): string | undefined {
  const fm = parseFrontmatter(content);
  const summary = fm?.fields.find((f) => f.key === "summary")?.value;
  return summary || undefined;
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
        return { file: { path: abs, relPath: rel, name: baseName(entry.name), summary: noteSummary(content) } };
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

/** Read a note's raw content from disk. */
export function readNote(path: string): Promise<string> {
  return readTextFile(path);
}

/** Write a note's raw content to disk. */
export function writeNote(path: string, content: string): Promise<void> {
  return writeTextFile(path, content);
}
