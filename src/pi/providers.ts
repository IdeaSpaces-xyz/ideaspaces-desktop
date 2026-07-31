// The API-key providers a user can connect for the local Pi agent, by pi's own
// provider ids (KnownProvider in @earendil-works/pi-ai). pi accepts any provider
// string, but a curated list keeps the picker honest; OAuth ("log in with…") is
// a later slice. Anthropic first — the default local-agent model. Shared by the
// login form and the settings view so the two never drift.
import type { PiProvider } from "../lib/cli";

export interface PiProviderInfo {
  id: string;
  label: string;
}

export const PI_PROVIDERS: PiProviderInfo[] = [
  { id: "anthropic", label: "Anthropic (Claude)" },
  { id: "openai", label: "OpenAI" },
  { id: "google", label: "Google (Gemini)" },
  { id: "xai", label: "xAI (Grok)" },
  { id: "groq", label: "Groq" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "mistral", label: "Mistral" },
  { id: "openrouter", label: "OpenRouter" },
];

export type ProviderConnState = "connected" | "expired" | "disconnected";

export interface ProviderRow extends PiProviderInfo {
  state: ProviderConnState;
}

/**
 * Join the static provider list with pi's per-provider auth status (pi-status's
 * `providers[]`). `connected` = has creds and not expired; `expired` = creds
 * present but past expiry (re-login fixes it); else `disconnected`. A configured
 * provider that isn't in the known list still shows (labeled by its raw id), so
 * the view never hides something the user actually authed and can disconnect.
 */
export function providerRows(providers: PiProviderInfo[], status: PiProvider[]): ProviderRow[] {
  const byName = new Map(status.map((p) => [p.name, p]));
  const knownIds = new Set(providers.map((p) => p.id));
  const rowFor = (id: string, label: string): ProviderRow => {
    const s = byName.get(id);
    const state: ProviderConnState =
      !s || !s.hasCreds ? "disconnected" : s.expired ? "expired" : "connected";
    return { id, label, state };
  };
  const known = providers.map((p) => rowFor(p.id, p.label));
  const extra = status
    .filter((s) => !knownIds.has(s.name) && s.hasCreds)
    .map((s) => rowFor(s.name, s.name));
  return [...known, ...extra];
}
