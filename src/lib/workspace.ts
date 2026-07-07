import { homeDir, join } from "@tauri-apps/api/path";
import { load, type Store } from "@tauri-apps/plugin-store";

// Where each account's clones land — the per-account "vault" parent. Keyed by
// context ref so an org's repos stay separate from your personal ones. Persisted
// via tauri-plugin-store (a real file in the app config dir) rather than
// localStorage, so it survives webview lifecycle events and reinstalls. Only
// overrides are stored; the default is derived from the account.
const FILE = "settings.json";
const KEY = "account-roots";

let storePromise: Promise<Store> | null = null;
function store(): Promise<Store> {
  if (!storePromise) storePromise = load(FILE, { autoSave: true, defaults: {} });
  return storePromise;
}

// Stable ref for an account — mirrors space-context.ts: personal by username,
// org by hostname. Pure so it's testable and identical on both sides.
export function accountRef(hostname: string | null, username: string | null): string {
  return hostname ? `hostname:${hostname}` : `person:${username ?? ""}`;
}

// Where a space's clones land: the per-account override if set, else the default
// — `~/IdeaSpaces` for personal, `~/IdeaSpaces/<hostname>` for an org, so each
// account's repos stay separate.
export async function accountRoot(
  hostname: string | null,
  username: string | null,
): Promise<string> {
  const roots = (await (await store()).get<Record<string, string>>(KEY)) ?? {};
  const override = roots[accountRef(hostname, username)];
  if (override) return override;
  const base = await join(await homeDir(), "IdeaSpaces");
  return hostname ? join(base, hostname) : base;
}

// Set (or clear) an account's clone-root override, keyed by its context ref.
export async function setAccountRoot(ref: string, dir: string): Promise<void> {
  const s = await store();
  const roots = (await s.get<Record<string, string>>(KEY)) ?? {};
  roots[ref] = dir;
  await s.set(KEY, roots);
}
