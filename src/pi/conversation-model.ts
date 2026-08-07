import { load, type Store } from "@tauri-apps/plugin-store";
import type { PiThinkingLevel } from "../lib/cli";

// Remember the model + thinking level a local conversation was last sent with,
// so reopening it restores them instead of snapping back to the default and
// making the user re-pick. Keyed by conversation id in settings.json (same store
// as the rest of the app's prefs). Best-effort: a read/write failure just falls
// back to the default, never blocks the conversation.
const FILE = "settings.json";
const KEY = "pi-conversation-models";
// The app-wide default a NEW conversation opens with — the last model+thinking
// you sent, so you don't re-pick every time. Interim: this is a flat local
// default; the space-shaped agent identity (defaults read from a space's
// `_agent/agents/<agent_id>`) supersedes it — see the POV/agent-identity plan.
const DEFAULT_KEY = "pi-default-model";

let storePromise: Promise<Store> | null = null;
function store(): Promise<Store> {
  if (!storePromise) storePromise = load(FILE, { autoSave: true, defaults: {} });
  return storePromise;
}

export interface ConversationModel {
  model?: string;
  thinking?: PiThinkingLevel;
}

export async function getConversationModel(id: string): Promise<ConversationModel> {
  try {
    const all = (await (await store()).get<Record<string, ConversationModel>>(KEY)) ?? {};
    return all[id] ?? {};
  } catch {
    return {};
  }
}

export async function setConversationModel(id: string, value: ConversationModel): Promise<void> {
  try {
    const s = await store();
    const all = (await s.get<Record<string, ConversationModel>>(KEY)) ?? {};
    all[id] = value;
    await s.set(KEY, all);
  } catch {
    /* best-effort — the turn already ran; restoring the model next time is a nicety */
  }
}

/** The app-wide default a new conversation opens with (last model+thinking used). */
export async function getDefaultModel(): Promise<ConversationModel> {
  try {
    return (await (await store()).get<ConversationModel>(DEFAULT_KEY)) ?? {};
  } catch {
    return {};
  }
}

/** Remember the last-used model+thinking as the default for new conversations. */
export async function setDefaultModel(value: ConversationModel): Promise<void> {
  try {
    await (await store()).set(DEFAULT_KEY, value);
  } catch {
    /* best-effort — the default is a convenience, never blocks a turn */
  }
}
