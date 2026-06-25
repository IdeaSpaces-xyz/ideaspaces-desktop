import { load, type Store } from "@tauri-apps/plugin-store";

// The active Personal/org context, persisted so it survives relaunch instead of
// snapping back to Personal each time. Same store + pattern as workspace.ts.
const FILE = "settings.json";
const KEY = "active-context";

let storePromise: Promise<Store> | null = null;
function store(): Promise<Store> {
  if (!storePromise) storePromise = load(FILE, { autoSave: true, defaults: {} });
  return storePromise;
}

export async function getActiveContextRef(): Promise<string | undefined> {
  return (await (await store()).get<string>(KEY)) ?? undefined;
}

export async function setActiveContextRef(ref: string): Promise<void> {
  await (await store()).set(KEY, ref);
}
