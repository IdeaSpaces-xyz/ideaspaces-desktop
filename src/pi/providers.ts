// Model providers for the local Pi agent, by pi's own provider ids (the strings
// pi-status/pi-models report). Two facts shape this:
//   • pi has distinct providers for the same vendor by auth method — `openai` is
//     the API-key provider, `openai-codex` is "Sign in with ChatGPT" (OAuth).
//     They report as different ids, so the settings view must know both.
//   • What's *usable* comes from pi's getAvailable() (auth.json + env vars +
//     ambient creds), which pi-models reflects; auth.json alone (pi-status) can
//     miss an env-configured provider. So a provider with models counts as
//     connected even without an auth.json entry.
import type { PiProvider } from "../lib/cli";

export interface PiProviderInfo {
  id: string;
  label: string;
}

// Friendly labels for the pi provider ids we expect to see. Unknown ids fall
// back to a title-cased form so a provider we don't list still reads sensibly.
export const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (API key)",
  "openai-codex": "OpenAI (ChatGPT)",
  google: "Google (Gemini)",
  gemini: "Google (Gemini)",
  xai: "xAI (Grok)",
  groq: "Groq",
  deepseek: "DeepSeek",
  mistral: "Mistral",
  openrouter: "OpenRouter",
  ideaspaces: "IdeaSpaces",
};

export function labelFor(id: string): string {
  return PROVIDER_LABELS[id] ?? id.replace(/(^|[-_])(\w)/g, (_m, sep, ch) => (sep ? " " : "") + ch.toUpperCase());
}

// The providers a user can connect here with an API key (the login form's
// dropdown). OAuth-only providers (e.g. openai-codex) aren't connectable from
// this UI — they're set up via pi's own sign-in — so they're not listed here,
// only recognized when already configured. Anthropic first (the default model).
const API_KEY_PROVIDER_IDS = [
  "anthropic",
  "openai",
  "google",
  "xai",
  "groq",
  "deepseek",
  "mistral",
  "openrouter",
];

export const PI_PROVIDERS: PiProviderInfo[] = API_KEY_PROVIDER_IDS.map((id) => ({
  id,
  label: labelFor(id),
}));

export type ProviderConnState = "connected" | "expired" | "disconnected";

export interface ProviderRow extends PiProviderInfo {
  state: ProviderConnState;
  /** Has an auth.json entry we can drop with pi-logout. A provider usable only
   *  via env/ambient creds (in the models list but not auth.json) isn't. */
  removable: boolean;
}

/**
 * The provider rows for the settings view: the union of the connectable list,
 * pi-status's configured providers (auth.json), and the providers that actually
 * have models (pi-models — pi's real getAvailable, env included). State reflects
 * usability: creds present → connected/expired; else present in the models list
 * → connected (env/ambient); else disconnected. This is what keeps an OAuth
 * provider (openai-codex) or an env-configured one from showing "not connected"
 * while its models plainly work.
 */
export function providerRows(
  connectable: PiProviderInfo[],
  status: PiProvider[],
  availableProviderIds: string[] = [],
): ProviderRow[] {
  const byName = new Map(status.map((p) => [p.name, p]));
  const available = new Set(availableProviderIds);
  const ids = new Set<string>([
    ...connectable.map((p) => p.id),
    // Configured (has-creds) providers not in the curated list — e.g. openai-codex.
    // A credential-less auth.json stub isn't shown unless it's a curated provider.
    ...status.filter((p) => p.hasCreds).map((p) => p.name),
    ...availableProviderIds,
  ]);
  return [...ids].map((id) => {
    const s = byName.get(id);
    const removable = !!s && s.hasCreds;
    const state: ProviderConnState =
      s && s.hasCreds ? (s.expired ? "expired" : "connected") : available.has(id) ? "connected" : "disconnected";
    return { id, label: labelFor(id), state, removable };
  });
}
