import { lazy, Suspense, useState } from "react";
import { PartyPopper, X } from "lucide-react";
import { useUpdater } from "./updater-context";

// Shown once after the app comes up from an update: a friendly confirmation +
// a way into the release's story (the Chronicle notes). The modal is lazy so
// react-markdown loads only when someone opens it.
const ReleaseNotesModal = lazy(() => import("./ReleaseNotesModal"));

export function UpdatedNotice() {
  const { justUpdated, dismissJustUpdated } = useUpdater();
  const [open, setOpen] = useState(false);

  if (!justUpdated) return null;

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4">
        <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border border-is-border bg-is-surface px-4 py-2.5 font-chrome text-[13px] shadow-lg">
          <PartyPopper size={16} strokeWidth={1.75} className="shrink-0 text-is-accent" aria-hidden />
          <span className="text-is-text">
            Updated to <span className="text-is-text-secondary">v{justUpdated.version}</span>
          </span>
          <div className="ml-2 flex items-center gap-1.5">
            <button
              onClick={() => setOpen(true)}
              className="rounded-md bg-is-text px-2.5 py-1 text-[12px] font-medium text-is-bg transition hover:opacity-90"
            >
              What&apos;s new
            </button>
            <button
              onClick={dismissJustUpdated}
              aria-label="Dismiss"
              className="rounded-md p-1 text-is-text-tertiary transition hover:text-is-text"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      </div>

      {open && (
        <Suspense fallback={null}>
          <ReleaseNotesModal
            version={justUpdated.version}
            notes={justUpdated.notes}
            // Reading the notes acknowledges the update — close clears the notice.
            onClose={() => {
              setOpen(false);
              dismissJustUpdated();
            }}
          />
        </Suspense>
      )}
    </>
  );
}
