import { Download, FolderInput, RefreshCw } from "lucide-react";
import type { CloneRecord, Space } from "../lib/cli";

const actionBtn =
  "inline-flex items-center gap-1.5 rounded-md border border-is-border bg-is-surface px-2.5 py-1.5 text-xs text-is-text-secondary transition hover:border-is-accent hover:text-is-text disabled:cursor-not-allowed disabled:opacity-50";
const iconBtn =
  "inline-flex items-center justify-center rounded-md border border-is-border bg-is-surface p-1.5 text-is-text-secondary transition hover:border-is-accent hover:text-is-text disabled:cursor-not-allowed disabled:opacity-50";

export function SpacesList({
  spaces,
  cloneIndex,
  busyId,
  onClone,
  onCloneTo,
  onSync,
}: {
  spaces: Space[];
  cloneIndex: Map<string, CloneRecord>;
  busyId: string | null;
  onClone: (space: Space) => void;
  onCloneTo: (space: Space) => void;
  onSync: (repoId: string, path: string, slug: string) => void;
}) {
  if (spaces.length === 0) {
    return <p className="text-sm text-is-text-secondary">No spaces here yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {spaces.map((space) => {
        const clone = cloneIndex.get(space.repo_id);
        const busy = busyId === space.repo_id;

        return (
          <li
            key={space.repo_id}
            className="flex items-center justify-between gap-3 rounded-lg border border-is-border bg-is-surface px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-is-text">{space.slug}</p>
              <p className="truncate text-xs text-is-text-tertiary">
                {clone ? clone.path : `${space.hostname ?? "Personal"} · ${space.role}`}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {clone ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onSync(space.repo_id, clone.path, space.slug)}
                  className={actionBtn}
                >
                  <RefreshCw
                    size={14}
                    strokeWidth={1.333}
                    className={busy ? "animate-spin" : undefined}
                    aria-hidden="true"
                  />
                  {busy ? "Syncing…" : "Sync"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onClone(space)}
                    className={actionBtn}
                  >
                    <Download size={14} strokeWidth={1.333} aria-hidden="true" />
                    {busy ? "Cloning…" : "Clone"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onCloneTo(space)}
                    aria-label={`Clone ${space.slug} to a chosen folder`}
                    title="Clone to…"
                    className={iconBtn}
                  >
                    <FolderInput size={14} strokeWidth={1.333} aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
