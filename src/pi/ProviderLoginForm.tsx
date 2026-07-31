import { useState } from "react";
import { piLogin } from "../lib/cli";
import { PI_PROVIDERS as PROVIDERS } from "./providers";
import { useToast } from "../toast/toast-context";

const labelCls = "font-chrome text-[11px] uppercase tracking-[0.08em] text-is-text-tertiary";
const fieldCls =
  "w-full rounded-md border border-is-border bg-is-bg px-2.5 py-1.5 text-sm text-is-text outline-none focus-visible:border-is-accent placeholder:text-is-text-tertiary disabled:opacity-50";
const submitCls =
  "shrink-0 rounded-md bg-is-text px-3 py-1.5 font-chrome text-xs text-is-bg transition hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring";

/**
 * The API-key sign-in on the `needs-provider` state: pick a provider, paste a
 * key, and the CLI's `pi-login` writes pi's `auth.json`. On success we recheck
 * pi-status (via `onDone`) so the card flips to `ready`. The key never leaves
 * this form except as the `pi-login` argument — the desktop never stores it.
 */
export function ProviderLoginForm({
  onDone,
  initialProvider,
}: {
  onDone: () => void;
  /** Pre-select this provider id (e.g. the settings row the user clicked). */
  initialProvider?: string;
}) {
  const toast = useToast();
  const [provider, setProvider] = useState(
    initialProvider && PROVIDERS.some((p) => p.id === initialProvider)
      ? initialProvider
      : PROVIDERS[0].id,
  );
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const key = apiKey.trim();
    if (!key || busy) return;
    setBusy(true);
    try {
      await piLogin(provider, key);
      setApiKey(""); // don't leave the secret in component state
      const label = PROVIDERS.find((p) => p.id === provider)?.label ?? provider;
      toast(`Connected ${label}`, "success");
      onDone(); // recheck pi-status → card flips to ready
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className={labelCls} htmlFor="pi-provider">
        Provider
      </label>
      <select
        id="pi-provider"
        value={provider}
        onChange={(e) => setProvider(e.target.value)}
        disabled={busy}
        className={fieldCls}
      >
        {PROVIDERS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <label className={labelCls} htmlFor="pi-api-key">
        API key
      </label>
      <div className="flex items-center gap-2">
        <input
          id="pi-api-key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="Paste your API key"
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
          className={fieldCls}
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !apiKey.trim()}
          className={submitCls}
        >
          {busy ? "Connecting…" : "Connect"}
        </button>
      </div>
      <p className="text-[11px] text-is-text-tertiary">
        Stored locally by pi ({"~/.pi/agent"}). The key stays on this machine.
      </p>
    </div>
  );
}
