import { load, type Store } from "@tauri-apps/plugin-store";

// The conversation's durable working set: mounted roots (absolute paths) the
// user pins as read-only context alongside the workspace home. The desktop OWNS
// this set (pi runs one process per turn, so in-session is_mount roots reset) and
// re-seeds it each turn via IS_MOUNTS. Keyed by context+conversation in
// settings.json — same store as the model/thinking prefs. Best-effort: a store
// failure falls back to no mounts, never blocks a turn.
const FILE = "settings.json";
const KEY = "pi-conversation-mounts";

// IS_MOUNTS is a comma-delimited env string (mountsToEnv → cli.ts), so a mount
// path may not contain a comma — it would split into two bogus entries pi then
// skips. Reject at the boundary rather than silently corrupt the working set.
export function isValidMountPath(path: string): boolean {
  const p = path.trim();
  return p.length > 0 && !p.includes(",");
}

/** Pure reducer — add `path`, absolute-deduped, order-preserving. No-op if present. */
export function applyMount(cur: string[], path: string): string[] {
  return cur.includes(path) ? cur : [...cur, path];
}

/** Pure reducer — drop `path`. */
export function dropMount(cur: string[], path: string): string[] {
  return cur.filter((p) => p !== path);
}

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

// Serialize mutations so two overlapping add/remove calls can't each read the
// same snapshot and clobber the other's write (the store's autoSave read-modify-
// write is not atomic). Each critical section reads fresh state, applies its
// reducer, and writes — chained so they run one at a time.
let writeChain: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.catch(() => {});
  return run;
}

async function mutate(
  context: string,
  id: string,
  reduce: (cur: string[]) => string[],
): Promise<string[]> {
  return serialize(async () => {
    try {
      const s = await store();
      const all = (await s.get<Record<string, string[]>>(KEY)) ?? {};
      const k = keyFor(context, id);
      const next = reduce(all[k] ?? []);
      if (next.length) all[k] = next;
      else delete all[k];
      await s.set(KEY, all);
      return next;
    } catch {
      // Best-effort: reflect the change in memory even if the store write failed.
      return reduce(await getConversationMounts(context, id));
    }
  });
}

/** Pin a mount; returns the updated set. No-op if already mounted. */
export async function addConversationMount(context: string, id: string, path: string): Promise<string[]> {
  return mutate(context, id, (cur) => applyMount(cur, path));
}

/** Unpin a mount; returns the updated set. */
export async function removeConversationMount(context: string, id: string, path: string): Promise<string[]> {
  return mutate(context, id, (cur) => dropMount(cur, path));
}
