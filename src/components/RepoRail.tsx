import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Cloud,
  Download,
  FolderInput,
  FolderPlus,
  Link2,
  MoreHorizontal,
  RefreshCw,
} from "lucide-react";
import type { Space } from "../lib/cli";
import type { RepoEntries, RepoEntry } from "../lib/repo-entry";
import type { SyncBadge } from "../lib/sync-state";

// The left rail: your repos for the active context (it reacts to the header
// context switcher). On-disk repos open the editor on click, with a directional
// sync glyph; online-only repos are made available offline from a "⋯" menu.
// Clones outside the active context surface in an "On this device" group so a
// repo you have offline is never lost behind the context filter.

// Directional sync glyph, silent when synced: ↑ upload, ↓ download, ↕ diverged.
// A failed status (unknown) shows a faint neutral dot so genuinely-unsynced work
// is never masked as clean; a still-checking status stays silent (optimistic).
// Rendered in a fixed-width slot so synced and unsynced rows stay aligned.
function SyncIndicator({ badge, failed }: { badge: SyncBadge | undefined; failed: boolean }) {
  if (!badge) {
    if (!failed) return null;
    return (
      <span
        title="status unavailable"
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full bg-is-text-tertiary/30"
      />
    );
  }
  if (badge.synced) return null; // silent-synced — the good state earns no glyph
  const Icon =
    badge.direction === "pull" ? ArrowDown : badge.direction === "both" ? ArrowUpDown : ArrowUp;
  return <Icon size={13} strokeWidth={1.5} className="text-is-accent" aria-label={badge.label} />;
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
          className="z-50 min-w-[13rem] rounded-lg border border-is-border bg-is-surface p-1 shadow-md"
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// A repo that's on disk (available or local-only): opens on click, shows a
// directional sync glyph, and offers Sync on hover when there's work.
function DiskRow({
  entry,
  busy,
  onOpen,
  onSync,
}: {
  entry: RepoEntry;
  busy: boolean;
  onOpen: (entry: RepoEntry) => void;
  onSync: (repoId: string, path: string, slug: string) => void;
}) {
  const badge = entry.sync;
  const sync = !!badge && !badge.synced;
  const clonePath = entry.clone?.path;
  return (
    <li
      title={clonePath}
      className="group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 transition hover:bg-is-surface-alt"
    >
      {/* Whole-row open; the glyph/name pass clicks through to it. */}
      <button
        type="button"
        onClick={() => onOpen(entry)}
        aria-label={`Open ${entry.slug}`}
        className="absolute inset-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
      />
      {/* Fixed slot so silent-synced rows align with unsynced ones. */}
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        <SyncIndicator badge={badge} failed={entry.statusFailed} />
      </span>
      <span className="pointer-events-none min-w-0 flex-1 truncate text-[13px] tracking-[-0.01em] text-is-text">
        {entry.slug}
      </span>
      {sync &&
        clonePath &&
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
            onClick={() => onSync(entry.repoId, clonePath, entry.slug)}
            title={badge.label}
            aria-label={`${badge.verb} ${entry.slug}`}
            className="relative shrink-0 rounded p-1 text-is-text-tertiary opacity-0 transition hover:text-is-text focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring group-hover:opacity-100"
          >
            <RefreshCw size={13} strokeWidth={1.333} aria-hidden="true" />
          </button>
        ))}
    </li>
  );
}

// An online-only repo: not on disk. A faded name + cloud glyph; make it
// available offline (or pick a folder / link one you already have) from the menu.
function CloudRow({
  entry,
  busy,
  onClone,
  onCloneTo,
  onLinkExisting,
}: {
  entry: RepoEntry;
  busy: boolean;
  onClone: (space: Space) => void;
  onCloneTo: (space: Space) => void;
  onLinkExisting: (space: Space) => void;
}) {
  const space = entry.space;
  return (
    <li className="group flex items-center gap-2.5 rounded-md px-2.5 py-2 hover:bg-is-surface-alt">
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        <Cloud size={13} strokeWidth={1.5} className="text-is-text-tertiary/70" aria-label="online only" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] tracking-[-0.01em] text-is-text-secondary">
        {entry.slug}
      </span>
      {space &&
        (busy ? (
          <RefreshCw size={13} strokeWidth={1.333} className="shrink-0 animate-spin text-is-text-tertiary" aria-hidden="true" />
        ) : (
          <RowMenu label={`Actions for ${entry.slug}`}>
            <DropdownMenu.Item className={rowMenuItem} onSelect={() => onClone(space)}>
              <Download size={14} strokeWidth={1.333} className="text-is-text-tertiary" aria-hidden="true" />
              Make available offline
            </DropdownMenu.Item>
            <DropdownMenu.Item className={rowMenuItem} onSelect={() => onCloneTo(space)}>
              <FolderInput size={14} strokeWidth={1.333} className="text-is-text-tertiary" aria-hidden="true" />
              Make available offline at…
            </DropdownMenu.Item>
            <DropdownMenu.Item className={rowMenuItem} onSelect={() => onLinkExisting(space)}>
              <Link2 size={14} strokeWidth={1.333} className="text-is-text-tertiary" aria-hidden="true" />
              Link a folder I already have…
            </DropdownMenu.Item>
          </RowMenu>
        ))}
    </li>
  );
}

function RepoRow({
  entry,
  busy,
  onOpen,
  onClone,
  onCloneTo,
  onLinkExisting,
  onSync,
}: {
  entry: RepoEntry;
  busy: boolean;
  onOpen: (entry: RepoEntry) => void;
  onClone: (space: Space) => void;
  onCloneTo: (space: Space) => void;
  onLinkExisting: (space: Space) => void;
  onSync: (repoId: string, path: string, slug: string) => void;
}) {
  if (entry.clone) {
    return <DiskRow entry={entry} busy={busy} onOpen={onOpen} onSync={onSync} />;
  }
  return (
    <CloudRow
      entry={entry}
      busy={busy}
      onClone={onClone}
      onCloneTo={onCloneTo}
      onLinkExisting={onLinkExisting}
    />
  );
}

const sectionLabel = "px-2.5 pb-1 pt-2 text-[11px] uppercase tracking-[0.1em] text-is-text-tertiary";

export function RepoRail({
  entries,
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
  entries: RepoEntries;
  busyIds: Set<string>;
  status: "loading" | "loaded" | "error";
  error?: string;
  onReload: () => void;
  onOpen: (entry: RepoEntry) => void;
  onClone: (space: Space) => void;
  onCloneTo: (space: Space) => void;
  onLinkExisting: (space: Space) => void;
  onSync: (repoId: string, path: string, slug: string) => void;
  onLinkFolder: () => void;
  linking: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const { inContext, onDevice } = entries;
  const hasClones = inContext.some((e) => e.clone) || onDevice.length > 0;

  const renderRow = (entry: RepoEntry) => (
    <RepoRow
      key={entry.repoId}
      entry={entry}
      busy={busyIds.has(entry.repoId)}
      onOpen={onOpen}
      onClone={onClone}
      onCloneTo={onCloneTo}
      onLinkExisting={onLinkExisting}
      onSync={onSync}
    />
  );

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
        {status === "loaded" && (
          <>
            {inContext.length === 0 ? (
              <p className="px-2 py-2 text-xs text-is-text-tertiary">No repos in this context.</p>
            ) : (
              <ul className="flex flex-col gap-0.5">{inContext.map(renderRow)}</ul>
            )}
            {onDevice.length > 0 && (
              <>
                <h3 className={sectionLabel} title="Repos you have offline, from other contexts">
                  On this device
                </h3>
                <ul className="flex flex-col gap-0.5">{onDevice.map(renderRow)}</ul>
              </>
            )}
          </>
        )}
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
