// Raw note-file IO over a local clone, via the Tauri fs plugin.
//
// The editor edits file *content* only — listing, reading, writing markdown.
// Git (commit/push) stays in the CLI sidecar (see commitClone/syncClone). The
// fs capability is scoped to the home tree; macOS TCC gates protected folders.

import { readDir, readTextFile, writeTextFile, type DirEntry } from "@tauri-apps/plugin-fs";

export interface NoteFile {
  /** Absolute path on disk. */
  path: string;
  /** Path relative to the clone root (the git pathspec, POSIX separators). */
  relPath: string;
  /** Display name — the filename without extension. */
  name: string;
}

// Directories we never descend into when listing notes.
const SKIP_DIRS = new Set([".git", "node_modules", ".obsidian", "dist", "target", ".vite"]);

function isMarkdown(name: string): boolean {
  return name.endsWith(".md") || name.endsWith(".markdown");
}

function baseName(relPath: string): string {
  const file = relPath.slice(relPath.lastIndexOf("/") + 1);
  return file.replace(/\.(md|markdown)$/, "");
}

/**
 * List a clone's markdown notes, recursively (skipping `.git` and friends).
 * Returns them sorted by relative path so the tree reads top-down.
 */
export async function listNotes(cloneDir: string): Promise<NoteFile[]> {
  const out: NoteFile[] = [];

  async function walk(absDir: string, relDir: string): Promise<void> {
    let entries: DirEntry[];
    try {
      entries = await readDir(absDir);
    } catch {
      // A dir we can't read (permissions/TCC) shouldn't abort the whole listing.
      return;
    }
    for (const entry of entries) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      const abs = `${absDir}/${entry.name}`;
      if (entry.isDirectory) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        await walk(abs, rel);
      } else if (entry.isFile && isMarkdown(entry.name)) {
        out.push({ path: abs, relPath: rel, name: baseName(rel) });
      }
    }
  }

  await walk(cloneDir.replace(/\/+$/, ""), "");
  out.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return out;
}

/** Read a note's raw content from disk. */
export function readNote(path: string): Promise<string> {
  return readTextFile(path);
}

/** Write a note's raw content to disk. */
export function writeNote(path: string, content: string): Promise<void> {
  return writeTextFile(path, content);
}
