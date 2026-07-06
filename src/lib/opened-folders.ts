import { load, type Store } from "@tauri-apps/plugin-store";

// Accountless folders the user has opened — the "small Obsidian" contexts that
// need no login. Persisted (newest-first) so they survive relaunch, same store
// as active-context.ts / workspace.ts. A folder is just a path; its context is
// derived in space-context.ts.
const FILE = "settings.json";
const KEY = "opened-folders";

let storePromise: Promise<Store> | null = null;
function store(): Promise<Store> {
  if (!storePromise) storePromise = load(FILE, { autoSave: true, defaults: {} });
  return storePromise;
}

export async function getOpenedFolders(): Promise<string[]> {
  return (await (await store()).get<string[]>(KEY)) ?? [];
}

// Add (or move to front) a folder; returns the new list. Dedupes by exact path.
export async function addOpenedFolder(path: string): Promise<string[]> {
  const current = await getOpenedFolders();
  const next = [path, ...current.filter((p) => p !== path)];
  await (await store()).set(KEY, next);
  return next;
}

export async function removeOpenedFolder(path: string): Promise<string[]> {
  const next = (await getOpenedFolders()).filter((p) => p !== path);
  await (await store()).set(KEY, next);
  return next;
}
