import { Download, RefreshCw, X } from "lucide-react";
import { useUpdater } from "./updater-context";

// Non-intrusive floating prompt, top-center. Overlays (position: fixed) so it
// never shifts the app layout. Silent while idle/checking; appears only when
// there's something to act on.
export function UpdateBanner() {
  const { status, install, dismiss } = useUpdater();

  if (status.phase === "idle" || status.phase === "checking") return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border border-is-border bg-is-surface px-4 py-2.5 font-chrome text-[13px] shadow-lg">
        {status.phase === "available" && (
          <>
            <Download size={16} strokeWidth={1.75} className="shrink-0 text-is-accent" aria-hidden />
            <span className="text-is-text">
              Update available — <span className="text-is-text-secondary">v{status.version}</span>
            </span>
            <div className="ml-2 flex items-center gap-1.5">
              <button
                onClick={install}
                className="rounded-md bg-is-text px-2.5 py-1 text-[12px] font-medium text-is-bg transition hover:opacity-90"
              >
                Install &amp; Restart
              </button>
              <button
                onClick={dismiss}
                aria-label="Dismiss"
                className="rounded-md p-1 text-is-text-tertiary transition hover:text-is-text"
              >
                <X size={15} />
              </button>
            </div>
          </>
        )}

        {status.phase === "downloading" && (
          <>
            <RefreshCw size={16} strokeWidth={1.75} className="shrink-0 animate-spin text-is-accent" aria-hidden />
            <span className="text-is-text">
              Downloading v{status.version}…
              {status.pct != null ? ` ${Math.round(status.pct * 100)}%` : ""}
            </span>
          </>
        )}

        {status.phase === "ready" && (
          <>
            <RefreshCw size={16} strokeWidth={1.75} className="shrink-0 animate-spin text-is-accent" aria-hidden />
            <span className="text-is-text">Restarting into v{status.version}…</span>
          </>
        )}

        {status.phase === "error" && (
          <>
            <span className="text-is-danger-text">Update failed: {status.message}</span>
            <button
              onClick={dismiss}
              aria-label="Dismiss"
              className="ml-1 shrink-0 rounded-md p-1 text-is-text-tertiary transition hover:text-is-text"
            >
              <X size={15} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
