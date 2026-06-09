import { homeDir, join } from "@tauri-apps/api/path";

// Where clones land by default — the "vault" parent folder. Overridable; clones
// can also be pointed elsewhere per-clone. Stored as a plain path in localStorage.
const KEY = "is-workspace-dir";

export async function defaultWorkspaceDir(): Promise<string> {
  const stored = localStorage.getItem(KEY);
  if (stored) return stored;
  return join(await homeDir(), "IdeaSpaces");
}

export function setWorkspaceDir(dir: string): void {
  localStorage.setItem(KEY, dir);
}
