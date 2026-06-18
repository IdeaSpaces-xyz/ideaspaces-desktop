import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Download,
  FolderInput,
  FolderPlus,
  Link2,
  MoreHorizontal,
  RefreshCw,
} from "lucide-react";
import type { CloneRecord, CloneStatus, Space } from "../lib/cli";
import { cn } from "../lib/cn";

// The left rail: your repos for the active context (it reacts to the header
// context switcher). A cloned repo opens the editor on click, with a sync dot;
// a remote-only repo clones via its row menu. The full repo management lives in
// a per-row "⋯" menu so the list stays legible (the "clean sidebar" choice).

function needsSync(status: CloneStatus | undefined): boolean {
  return !!status && (!!status.ahead || !!status.behind || status.dirty);
}

function syncTitle(status: CloneStatus | undefined, failed: boolean): string {
  if (!status) return failed ? "status unavailable" : "checking…";
  if (!needsSync(status)) return "synced";
  const parts: string[] = [];
  if (status.behind) parts.push(`${status.behind} behind`);
  if (status.ahead) parts.push(`${status.ahead} ahead`);
  if (status.dirty) parts.push("uncommitted changes");
  return parts.join(", ");
}

// A small status dot: accent when there's something to sync, faint otherwise.
function SyncDot({ status, failed }: { status: CloneStatus | undefined; failed: boolean }) {
  return (
    <span
      title={syncTitle(status, failed)}
      aria-hidden="true"
      className={cn(
        "h-1.5 w-1.5 shrink-0 rounded-full",
        needsSync(status) ? "bg-is-accent" : "bg-is-text-tertiary/30",
      )}
    />
  );
}

const rowMenuItem =
  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 font-chrome text-xs text-is-text-secondary outline-none data-[highlighted]:bg-is-surface-alt data-[highlighted]:text-is-text disabled:cursor-not-allowed disabled:opacity-50";

function RowMenu({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className="relative shrink-0 rounded p-1 text-is-text-tertiary opacity-0 transition hover:text-is-text focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring group-hover:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontal size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-[11rem] rounded-lg border border-is-border bg-is-surface p-1 shadow-md"
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function RepoRow({
  space,
  clone,
  status,
  failed,
  busy,
  onOpen,
  onClone,
  onCloneTo,
  onLinkExisting,
  onSync,
}: {
  space: Space;
  clone: CloneRecord | undefined;
  status: CloneStatus | undefined;
  failed: boolean;
  busy: boolean;
  onOpen: (clone: CloneRecord) => void;
  onClone: (space: Space) => void;
  onCloneTo: (space: Space) => void;
  onLinkExisting: (space: Space) => void;
  onSync: (repoId: string, path: string, slug: string) => void;
}) {
  if (clone) {
    const sync = needsSync(status);
    return (
      <li
        title={clone.path}
        className="group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 transition hover:bg-is-surface-alt"
      >
        {/* Whole-row open; the dot/name pass clicks through to it. */}
        <button
          type="button"
          onClick={() => onOpen(clone)}
          aria-label={`Open ${space.slug}`}
          className="absolute inset-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
        />
        <SyncDot status={status} failed={failed} />
        <span className="pointer-events-none min-w-0 flex-1 truncate text-[13px] tracking-[-0.01em] text-is-text">
          {space.slug}
        </span>
        {sync &&
          (busy ? (
            <RefreshCw
              size={13}
              strokeWidth={1.333}
              className="relative shrink-0 animate-spin text-is-text-tertiary"
              aria-hidden="true"
            />
          ) : (
            <button
              type="button"
              onClick={() => onSync(space.repo_id, clone.path, space.slug)}
              title={syncTitle(status, failed)}
              aria-label={`Sync ${space.slug}`}
              className="relative shrink-0 rounded p-1 text-is-text-tertiary opacity-0 transition hover:text-is-text focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring group-hover:opacity-100"
            >
              <RefreshCw size={13} strokeWidth={1.333} aria-hidden="true" />
            </button>
          ))}
      </li>
    );
  }

  // Remote-only: not on disk. Clone (or clone-to / link) from the row menu.
  return (
    <li className="group flex items-center gap-2.5 rounded-md px-2.5 py-2 hover:bg-is-surface-alt">
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full border border-is-text-tertiary/40"
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate text-[13px] tracking-[-0.01em] text-is-text-secondary">
        {space.slug}
      </span>
      {busy ? (
        <RefreshCw size={13} strokeWidth={1.333} className="shrink-0 animate-spin text-is-text-tertiary" aria-hidden="true" />
      ) : (
        <RowMenu label={`Actions for ${space.slug}`}>
          <DropdownMenu.Item className={rowMenuItem} onSelect={() => onClone(space)}>
            <Download size={14} strokeWidth={1.333} className="text-is-text-tertiary" aria-hidden="true" />
            Clone
          </DropdownMenu.Item>
          <DropdownMenu.Item className={rowMenuItem} onSelect={() => onCloneTo(space)}>
            <FolderInput size={14} strokeWidth={1.333} className="text-is-text-tertiary" aria-hidden="true" />
            Clone to…
          </DropdownMenu.Item>
          <DropdownMenu.Item className={rowMenuItem} onSelect={() => onLinkExisting(space)}>
            <Link2 size={14} strokeWidth={1.333} className="text-is-text-tertiary" aria-hidden="true" />
            Link an existing folder…
          </DropdownMenu.Item>
        </RowMenu>
      )}
    </li>
  );
}

export function RepoRail({
  spaces,
  cloneIndex,
  statuses,
  failedStatuses,
  busyIds,
  status,
  error,
  onReload,
  onOpen,
  onClone,
  onCloneTo,
  onLinkExisting,
  onSync,
  onLinkFolder,
  linking,
  onRefresh,
  refreshing,
}: {
  spaces: Space[];
  cloneIndex: Map<string, CloneRecord>;
  statuses: Record<string, CloneStatus>;
  failedStatuses: Set<string>;
  busyIds: Set<string>;
  status: "loading" | "loaded" | "error";
  error?: string;
  onReload: () => void;
  onOpen: (clone: CloneRecord) => void;
  onClone: (space: Space) => void;
  onCloneTo: (space: Space) => void;
  onLinkExisting: (space: Space) => void;
  onSync: (repoId: string, path: string, slug: string) => void;
  onLinkFolder: () => void;
  linking: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const hasClones = spaces.some((s) => cloneIndex.has(s.repo_id));

  return (
    // Fragment Mono throughout — a clean, technical repo list.
    <aside className="flex w-60 shrink-0 flex-col border-r border-is-border bg-is-bg font-chrome">
      <div className="flex items-center justify-between px-3.5 py-3">
        <h2 className="text-[11px] uppercase tracking-[0.1em] text-is-text-tertiary">Repos</h2>
        {hasClones && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            title="Refresh status"
            aria-label="Refresh repo status"
            className="rounded p-1 text-is-text-tertiary transition hover:text-is-text disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
          >
            <RefreshCw
              size={13}
              strokeWidth={1.333}
              className={refreshing ? "animate-spin" : undefined}
              aria-hidden="true"
            />
          </button>
        )}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" aria-label="Repos">
        {status === "loading" && (
          <p className="px-2 py-1 text-xs text-is-text-tertiary">Loading repos…</p>
        )}
        {status === "error" && (
          <p className="px-2 py-1 text-xs text-is-danger-text">
            {error}{" "}
            <button
              type="button"
              onClick={onReload}
              className="underline underline-offset-2 hover:text-is-text"
            >
              Retry
            </button>
          </p>
        )}
        {status === "loaded" &&
          (spaces.length === 0 ? (
            <p className="px-2 py-2 text-xs text-is-text-tertiary">No repos in this context.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {spaces.map((space) => (
                <RepoRow
                  key={space.repo_id}
                  space={space}
                  clone={cloneIndex.get(space.repo_id)}
                  status={statuses[space.repo_id]}
                  failed={failedStatuses.has(space.repo_id)}
                  busy={busyIds.has(space.repo_id)}
                  onOpen={onOpen}
                  onClone={onClone}
                  onCloneTo={onCloneTo}
                  onLinkExisting={onLinkExisting}
                  onSync={onSync}
                />
              ))}
            </ul>
          ))}
      </nav>

      <div className="border-t border-is-border p-2">
        <button
          type="button"
          onClick={onLinkFolder}
          disabled={linking}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-is-text-tertiary transition hover:bg-is-surface-alt hover:text-is-text disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
        >
          <FolderPlus size={14} strokeWidth={1.333} aria-hidden="true" />
          {linking ? "Linking…" : "Link a folder"}
        </button>
      </div>
    </aside>
  );
}
