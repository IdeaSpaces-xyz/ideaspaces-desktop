import { useSyncExternalStore } from "react";
import { load, type Store } from "@tauri-apps/plugin-store";

// Model curation — which local Pi models are HIDDEN from the composer picker.
// A denylist, not an allowlist: new models (e.g. after a pi bump) show by
// default and the user only prunes what they don't want, so the menu shrinks
// without hiding anything they haven't seen. Persisted in settings.json and
// shared through a tiny reactive store (useSyncExternalStore) so the settings
// checkboxes and the composer picker update together, live — no remount needed.
const FILE = "settings.json";
const KEY = "pi-hidden-models";

let storePromise: Promise<Store> | null = null;
function store(): Promise<Store> {
  if (!storePromise) storePromise = load(FILE, { autoSave: true, defaults: {} });
  return storePromise;
}

// Module state. `hidden` gets a fresh identity on every change so
// useSyncExternalStore's snapshot equality detects it.
let hidden = new Set<string>();
const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach((l) => l());

let loadPromise: Promise<void> | null = null;
function ensureLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = store()
      .then((s) => s.get<string[]>(KEY))
      .then((arr) => {
        hidden = new Set(arr ?? []);
      })
      .catch(() => {
        /* first run / unreadable store → empty set = show all */
      })
      .finally(emit);
  }
  return loadPromise;
}

async function persist(): Promise<void> {
  try {
    await (await store()).set(KEY, [...hidden]);
  } catch {
    /* best-effort — the UI already reflects the change in memory */
  }
}

export function toggleHiddenModel(ref: string): void {
  const next = new Set(hidden);
  if (next.has(ref)) next.delete(ref);
  else next.add(ref);
  hidden = next;
  emit();
  void persist();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  void ensureLoaded();
  return () => {
    listeners.delete(cb);
  };
}
function snapshot(): Set<string> {
  return hidden;
}

/** Reactive access to the hidden-model set. The first subscribe kicks off the
 *  store read; the local read resolves well before the (CLI-backed) model list,
 *  so there's no un-curated flash to guard against. */
export function usePiHiddenModels(): { hidden: Set<string>; toggle: (ref: string) => void } {
  const h = useSyncExternalStore(subscribe, snapshot, snapshot);
  return { hidden: h, toggle: toggleHiddenModel };
}

/**
 * Apply curation to a model list. Hidden refs are dropped — but never to empty:
 * a composer with no models can't send, so if curation would hide everything we
 * fall back to the full list (the settings UI is where you fix an over-prune).
 */
export function visibleModels<T extends { ref: string }>(models: T[], hidden: Set<string>): T[] {
  if (hidden.size === 0) return models;
  const shown = models.filter((m) => !hidden.has(m.ref));
  return shown.length ? shown : models;
}

/**
 * Collapse dated snapshot ids (…-YYYYMMDD) when their base alias is also present.
 * pi lists both `claude-opus-4-5` (name "… (latest)") and the pinned
 * `claude-opus-4-5-20251101` — the alias tracks the same model, so the dated pin
 * is just a duplicate in the picker. Drop it only when the alias exists (same
 * provider); a snapshot with no alias stays.
 */
export function collapseSnapshots<T extends { id: string; provider: string }>(models: T[]): T[] {
  const present = new Set(models.map((m) => `${m.provider}/${m.id}`));
  return models.filter((m) => {
    const base = m.id.replace(/-\d{8}$/, "");
    return base === m.id || !present.has(`${m.provider}/${base}`);
  });
}

/** Group models by provider, preserving first-seen provider order. Used to render
 *  the picker with `<optgroup>` headers instead of one flat list. */
export function groupByProvider<T extends { provider: string }>(models: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const m of models) groups.set(m.provider, [...(groups.get(m.provider) ?? []), m]);
  return [...groups.entries()];
}
