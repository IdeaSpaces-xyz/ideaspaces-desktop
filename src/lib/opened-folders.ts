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

// Pure list transforms — extracted so the dedupe / move-to-front / remove logic
// is unit-testable without the (Tauri-backed) store.
export function promoteFolder(list: string[], path: string): string[] {
  return [path, ...list.filter((p) => p !== path)];
}
export function withoutFolder(list: string[], path: string): string[] {
  return list.filter((p) => p !== path);
}

// Is `path` within the home tree? Requires the separator so `/Users/bobby` isn't
// treated as inside `/Users/bob`. The `fs` capabilities are scoped to `$HOME/**`
// (src-tauri/capabilities/default.json), so a folder outside home would read but
// silently fail to write — we reject it up front. Assumes `/`-separated paths,
// the same macOS/Linux assumption as folderContext() in space-context.ts.
export function isInsideHome(path: string, home: string): boolean {
  const h = home.replace(/\/+$/, "");
  return path === h || path.startsWith(h + "/");
}

export async function getOpenedFolders(): Promise<string[]> {
  return (await (await store()).get<string[]>(KEY)) ?? [];
}

// Add (or move to front) a folder; returns the new list. Dedupes by exact path.
export async function addOpenedFolder(path: string): Promise<string[]> {
  const next = promoteFolder(await getOpenedFolders(), path);
  await (await store()).set(KEY, next);
  return next;
}

export async function removeOpenedFolder(path: string): Promise<string[]> {
  const next = withoutFolder(await getOpenedFolders(), path);
  await (await store()).set(KEY, next);
  return next;
}
