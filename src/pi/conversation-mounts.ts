import { load, type Store } from "@tauri-apps/plugin-store";

// The conversation's durable working set: mounted roots (absolute paths) the
// user pins as read-only context alongside the workspace home. The desktop OWNS
// this set (pi runs one process per turn, so in-session is_mount roots reset) and
// re-seeds it each turn via IS_MOUNTS. Keyed by context+conversation in
// settings.json — same store as the model/thinking prefs. Best-effort: a store
// failure falls back to no mounts, never blocks a turn.
const FILE = "settings.json";
const KEY = "pi-conversation-mounts";

let storePromise: Promise<Store> | null = null;
function store(): Promise<Store> {
  if (!storePromise) storePromise = load(FILE, { autoSave: true, defaults: {} });
  return storePromise;
}

const keyFor = (context: string, id: string): string => `${context}::${id}`;

export async function getConversationMounts(context: string, id: string): Promise<string[]> {
  try {
    const all = (await (await store()).get<Record<string, string[]>>(KEY)) ?? {};
    return all[keyFor(context, id)] ?? [];
  } catch {
    return [];
  }
}

async function writeMounts(context: string, id: string, mounts: string[]): Promise<void> {
  try {
    const s = await store();
    const all = (await s.get<Record<string, string[]>>(KEY)) ?? {};
    const k = keyFor(context, id);
    if (mounts.length) all[k] = [...new Set(mounts)];
    else delete all[k];
    await s.set(KEY, all);
  } catch {
    /* best-effort — the panel already reflects the change in memory */
  }
}

/** Pin a mount; returns the updated set. No-op if already mounted. */
export async function addConversationMount(context: string, id: string, path: string): Promise<string[]> {
  const cur = await getConversationMounts(context, id);
  if (cur.includes(path)) return cur;
  const next = [...cur, path];
  await writeMounts(context, id, next);
  return next;
}

/** Unpin a mount; returns the updated set. */
export async function removeConversationMount(context: string, id: string, path: string): Promise<string[]> {
  const cur = await getConversationMounts(context, id);
  const next = cur.filter((p) => p !== path);
  await writeMounts(context, id, next);
  return next;
}
