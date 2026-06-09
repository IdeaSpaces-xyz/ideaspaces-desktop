import { homeDir, join } from "@tauri-apps/api/path";
import { load, type Store } from "@tauri-apps/plugin-store";

// Where clones land by default — the "vault" parent folder. Persisted via
// tauri-plugin-store (a real file in the app config dir) rather than
// localStorage, so it survives webview lifecycle events and reinstalls.
const FILE = "settings.json";
const KEY = "workspace-dir";

let storePromise: Promise<Store> | null = null;
function store(): Promise<Store> {
  if (!storePromise) storePromise = load(FILE, { autoSave: true, defaults: {} });
  return storePromise;
}

export async function defaultWorkspaceDir(): Promise<string> {
  const stored = await (await store()).get<string>(KEY);
  if (stored) return stored;
  return join(await homeDir(), "IdeaSpaces");
}

export async function setWorkspaceDir(dir: string): Promise<void> {
  await (await store()).set(KEY, dir);
}
