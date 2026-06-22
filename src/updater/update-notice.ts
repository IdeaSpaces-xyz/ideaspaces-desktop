import { load, type Store } from "@tauri-apps/plugin-store";
import type { UpdateNotice } from "./updater-context";

// A one-shot marker, persisted across the relaunch that an update triggers:
// install writes it right before relaunching; the next launch reads it once
// (and clears it) to show the "Updated to vX — what's new" notice exactly once.
// Same store file as the workspace dir (a real file in the app config dir).
const FILE = "settings.json";
const KEY = "pending-update-notice";

let storePromise: Promise<Store> | null = null;
function store(): Promise<Store> {
  if (!storePromise) storePromise = load(FILE, { autoSave: true, defaults: {} });
  return storePromise;
}

export async function markUpdateInstalled(notice: UpdateNotice): Promise<void> {
  await (await store()).set(KEY, notice);
}

/** Read the pending notice and clear it — fires the success notice once. */
export async function takeUpdateNotice(): Promise<UpdateNotice | null> {
  const s = await store();
  const notice = (await s.get<UpdateNotice>(KEY)) ?? null;
  if (notice) await s.delete(KEY);
  return notice;
}
