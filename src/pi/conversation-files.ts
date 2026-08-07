import { load, type Store } from "@tauri-apps/plugin-store";

// The conversation's durable "files in context": what the chat has touched —
// files you @-mentioned and files Pi read or edited. The desktop OWNS this set
// because `get --local` doesn't persist a workspace surface (it's per live turn
// and empty on reload), so we accumulate it here after each turn — same pattern
// as the mounts store. Keyed by context+conversation in settings.json.
const FILE = "settings.json";
const KEY = "pi-conversation-files";

// How a file entered context. When a path arrives more than once, the strongest
// action wins (edited > read > mentioned) so the panel groups it sensibly.
export type FileKind = "mentioned" | "read" | "edited";
const RANK: Record<FileKind, number> = { mentioned: 1, read: 2, edited: 3 };

export interface FileEntry {
  /** Absolute path on disk. */
  path: string;
  kind: FileKind;
}

/** A conversation's stored set: absolute path → strongest kind seen. */
export type FileMap = Record<string, FileKind>;

/** Pure: merge new entries into the map, keeping the strongest kind per path. */
export function mergeFiles(cur: FileMap, incoming: FileEntry[]): FileMap {
  const next = { ...cur };
  for (const { path, kind } of incoming) {
    const prev = next[path];
    if (!prev || RANK[kind] > RANK[prev]) next[path] = kind;
  }
  return next;
}

/** Pure: split a file map into display groups, each sorted by path. */
export function groupFiles(map: FileMap): { edited: string[]; read: string[]; mentioned: string[] } {
  const groups = { edited: [] as string[], read: [] as string[], mentioned: [] as string[] };
  for (const [path, kind] of Object.entries(map)) groups[kind].push(path);
  for (const k of Object.keys(groups) as (keyof typeof groups)[]) groups[k].sort();
  return groups;
}

let storePromise: Promise<Store> | null = null;
function store(): Promise<Store> {
  if (!storePromise) storePromise = load(FILE, { autoSave: true, defaults: {} });
  return storePromise;
}

const keyFor = (context: string, id: string): string => `${context}::${id}`;

export async function getConversationFiles(context: string, id: string): Promise<FileMap> {
  try {
    const all = (await (await store()).get<Record<string, FileMap>>(KEY)) ?? {};
    return all[keyFor(context, id)] ?? {};
  } catch {
    return {};
  }
}

// Serialize writes so overlapping accumulations (a fast second turn) can't each
// read the same snapshot and clobber the other — mirrors the mounts store.
let writeChain: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.catch(() => {});
  return run;
}

/** Accumulate `incoming` into the conversation's set; returns the merged map. */
export async function addConversationFiles(
  context: string,
  id: string,
  incoming: FileEntry[],
): Promise<FileMap> {
  if (incoming.length === 0) return getConversationFiles(context, id);
  return serialize(async () => {
    try {
      const s = await store();
      const all = (await s.get<Record<string, FileMap>>(KEY)) ?? {};
      const k = keyFor(context, id);
      const next = mergeFiles(all[k] ?? {}, incoming);
      all[k] = next;
      await s.set(KEY, all);
      return next;
    } catch {
      return mergeFiles(await getConversationFiles(context, id), incoming);
    }
  });
}
