import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { listFiles, type MentionEntry } from "../lib/cli";
import { basename } from "../lib/path";
import type { PreviewNode } from "@ideaspaces/conversation-ui";

// Loads a Context root (home or a mounted reference) into the shared PreviewPane.
// A root is a folder, not a note, so there's no node graph: we show its README
// rendered read-only, or a shallow folder listing when there's no README. fs
// reads are scoped to $HOME/** (the clone tree the workspace lives in); a root
// outside that scope throws, surfaced to the caller as the pane's error state.

const README_CANDIDATES = ["README.md", "readme.md", "Readme.md"];
const LISTING_LIMIT = 100;

const KIND_MARK: Record<MentionEntry["kind"], string> = {
  folder: "📁",
  "code-repo": "📦",
  "ideaspace-repo": "🗂️",
  file: "📄",
};

/** Pure: a root's display path — relative to home, or home's own basename. */
export function rootDisplayPath(root: string, home: string): string {
  const prefix = home.endsWith("/") ? home : `${home}/`;
  if (root === home) return basename(home);
  return root.startsWith(prefix) ? root.slice(prefix.length) : root;
}

// Mounted references hold third-party/cloned content, so a filename is untrusted
// text — never markdown. Escape the characters that would otherwise render as a
// link, image, emphasis, code, or raw HTML so a file named e.g. "[x](evil)"
// shows literally instead of becoming a live link. A filename may also legally
// contain newlines, which would break out of the list item into a fake
// heading/rule — collapse those to spaces so a name stays one line.
export function escapeMarkdown(s: string): string {
  return s.replace(/[\r\n]+/g, " ").replace(/[\\`*_[\]()<>~|#]/g, "\\$&");
}

/** Pure: render a shallow folder listing as read-only markdown (README fallback). */
export function renderListing(label: string, entries: MentionEntry[], truncated = false): string {
  const head = `# ${escapeMarkdown(label)}`;
  if (entries.length === 0) return `${head}\n\n_This folder is empty._`;
  const lines = entries.map((e) => `- ${KIND_MARK[e.kind] ?? "📄"} ${escapeMarkdown(e.name)}`);
  const more = truncated ? `\n\n_…and more (showing the first ${LISTING_LIMIT})._` : "";
  return `${head}\n\n_No README — folder contents:_\n\n${lines.join("\n")}${more}`;
}

export interface RootPreview {
  node: PreviewNode;
  /** Absolute path of the README shown — present only when a real README was
   *  found, so the pane can edit it. The listing fallback has no file to save. */
  readmePath?: string;
}

/** Read a root's preview: its README (editable), or a read-only shallow listing. */
export async function loadRootPreview(root: string, home: string): Promise<RootPreview> {
  const label = basename(root);
  for (const name of README_CANDIDATES) {
    const p = `${root}/${name}`;
    if (await exists(p)) {
      // The README's own repo-relative path: just its filename at home, else
      // nested under the root's relative path. (rootDisplayPath returns home's
      // basename for home — a label, not a path prefix, so don't join it here.)
      const path = root === home ? name : `${rootDisplayPath(root, home)}/${name}`;
      return { node: { name: label, path, content: await readTextFile(p) }, readmePath: p };
    }
  }
  // Fetch one past the cap so we can tell a full listing from a truncated one.
  const entries = await listFiles(root, "", LISTING_LIMIT + 1);
  const truncated = entries.length > LISTING_LIMIT;
  return {
    node: {
      name: label,
      path: rootDisplayPath(root, home),
      content: renderListing(label, entries.slice(0, LISTING_LIMIT), truncated),
    },
  };
}
