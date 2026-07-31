import { useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { piLogout } from "../lib/cli";
import { usePiStatus } from "./usePiStatus";
import { usePiModels } from "./usePiModels";
import { PI_PROVIDERS, providerRows, type ProviderConnState } from "./providers";
import { ProviderLoginForm } from "./ProviderLoginForm";
import { useToast } from "../toast/toast-context";
import { cn } from "../lib/cn";

// The Pi settings modal — reached from the user menu. Manage which model
// providers the local agent can use (connect/disconnect), and refresh the model
// list after a change. Provider auth lives in pi's auth.json (via the CLI); this
// view only reads pi-status and drives pi-login/pi-logout. Model *curation*
// (which of the connected models show in the composer) is a later slice.
const BADGE: Record<ProviderConnState, { label: string; cls: string }> = {
  connected: { label: "Connected", cls: "text-is-accent" },
  expired: { label: "Expired", cls: "text-is-danger-text" },
  disconnected: { label: "Not connected", cls: "text-is-text-tertiary" },
};

const rowBtn =
  "rounded-md border border-is-border px-2.5 py-1 font-chrome text-[11px] text-is-text-secondary transition hover:text-is-text disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring";

export function PiSettings({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const cardRef = useRef<HTMLDivElement>(null);
  const { state, recheck } = usePiStatus();
  const { models, loading: modelsLoading, refetch } = usePiModels();
  // The provider pre-selected in the connect form (set by a row's Connect), and
  // the provider a disconnect is in flight for (to disable its row).
  const [connectProvider, setConnectProvider] = useState<string | undefined>(undefined);
  const [busyProvider, setBusyProvider] = useState<string | null>(null);

  // Escape to close + a focus trap (mirrors ReleaseNotesModal): focus lands in
  // the modal and Tab cycles within it instead of leaking to the app behind.
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const focusables = () =>
      Array.from(
        card.querySelectorAll<HTMLElement>('button, a[href], input, select, [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => !el.hasAttribute("disabled"));
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    card.addEventListener("keydown", onKey);
    return () => card.removeEventListener("keydown", onKey);
  }, [onClose]);

  // pi-status carries the provider list in every kind that has a `pi` payload;
  // "checking"/"unavailable" don't, so default to empty.
  const statusProviders = "pi" in state ? state.pi.providers : [];
  const rows = providerRows(PI_PROVIDERS, statusProviders);

  // A provider change (connect or disconnect) invalidates both the auth status
  // and the model list — re-read both so the view (and count) reflect it.
  const onProviderChange = () => {
    void recheck();
    void refetch();
  };

  const disconnect = async (id: string) => {
    if (busyProvider) return;
    setBusyProvider(id);
    try {
      await piLogout(id);
      toast(`Disconnected ${id}`, "success");
      onProviderChange();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusyProvider(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Model providers"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-is-overlay p-4"
      onClick={onClose}
    >
      <div
        ref={cardRef}
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-is-border bg-is-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-is-border px-5 py-3">
          <h2 className="font-chrome text-[14px] text-is-text">Model providers</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-is-text-tertiary transition hover:text-is-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
          >
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          <p className="mb-3 text-[13px] leading-relaxed text-is-text-secondary">
            Connect a provider to unlock its models for the local agent. Keys are stored locally by pi
            (<code className="rounded bg-is-surface-alt px-1 py-0.5 font-chrome text-[11px]">~/.pi/agent</code>) and
            stay on this machine.
          </p>

          {state.kind === "checking" && (
            <p className="text-sm text-is-text-tertiary">Checking providers…</p>
          )}
          {state.kind === "unavailable" && (
            <p className="text-sm text-is-danger-text">
              Couldn&apos;t read pi status: {state.error}
            </p>
          )}

          {state.kind !== "checking" && state.kind !== "unavailable" && (
            <ul className="mb-4 divide-y divide-is-border rounded-lg border border-is-border">
              {rows.map((row) => (
                <li key={row.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-is-text">{row.label}</span>
                  <span className={cn("shrink-0 font-chrome text-[11px]", BADGE[row.state].cls)}>
                    {BADGE[row.state].label}
                  </span>
                  {row.state === "disconnected" ? (
                    <button type="button" className={rowBtn} onClick={() => setConnectProvider(row.id)}>
                      Connect
                    </button>
                  ) : (
                    <div className="flex shrink-0 gap-1.5">
                      {row.state === "expired" && (
                        <button type="button" className={rowBtn} onClick={() => setConnectProvider(row.id)}>
                          Reconnect
                        </button>
                      )}
                      <button
                        type="button"
                        className={rowBtn}
                        disabled={busyProvider === row.id}
                        onClick={() => void disconnect(row.id)}
                      >
                        {busyProvider === row.id ? "Disconnecting…" : "Disconnect"}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="rounded-lg border border-is-border bg-is-surface-alt/40 p-3">
            <p className="mb-2 font-chrome text-[11px] uppercase tracking-[0.08em] text-is-text-tertiary">
              Connect a provider
            </p>
            {/* Remount on provider change so a row's Connect pre-selects it. */}
            <ProviderLoginForm
              key={connectProvider ?? "default"}
              initialProvider={connectProvider}
              onDone={() => {
                setConnectProvider(undefined);
                onProviderChange();
              }}
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-is-border px-5 py-3">
          <span className="font-chrome text-[11px] text-is-text-tertiary">
            {modelsLoading
              ? "Checking models…"
              : `${models.length} model${models.length === 1 ? "" : "s"} available`}
          </span>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={modelsLoading}
            className="inline-flex items-center gap-1.5 rounded-md border border-is-border px-2.5 py-1 font-chrome text-[11px] text-is-text-secondary transition hover:text-is-text disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
          >
            <RefreshCw size={12} className={cn(modelsLoading && "animate-spin")} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
