import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { listFiles, type MentionEntry } from "../lib/cli";
import type { PreviewNode } from "@ideaspaces/conversation-ui";

// Loads a Context root (home or a mounted reference) into the shared PreviewPane.
// A root is a folder, not a note, so there's no node graph: we show its README
// rendered read-only, or a shallow folder listing when there's no README. fs
// reads are scoped to $HOME/** (the clone tree the workspace lives in); a root
// outside that scope throws, surfaced to the caller as the pane's error state.

const README_CANDIDATES = ["README.md", "readme.md", "Readme.md"];

const basename = (p: string) => p.split("/").filter(Boolean).pop() || p;

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

/** Pure: render a shallow folder listing as read-only markdown (README fallback). */
export function renderListing(label: string, entries: MentionEntry[]): string {
  if (entries.length === 0) return `# ${label}\n\n_This folder is empty._`;
  const lines = entries.map((e) => `- ${KIND_MARK[e.kind] ?? "📄"} ${e.name}`);
  return `# ${label}\n\n_No README — folder contents:_\n\n${lines.join("\n")}`;
}

/** Read a root's preview node: its README read-only, or a shallow listing. */
export async function loadRootPreview(root: string, home: string): Promise<PreviewNode> {
  const label = basename(root);
  const path = rootDisplayPath(root, home);
  for (const name of README_CANDIDATES) {
    const p = `${root}/${name}`;
    if (await exists(p)) {
      return { name: label, path: `${path}/${name}`, content: await readTextFile(p) };
    }
  }
  const entries = await listFiles(root, "", 100);
  return { name: label, path, content: renderListing(label, entries) };
}
