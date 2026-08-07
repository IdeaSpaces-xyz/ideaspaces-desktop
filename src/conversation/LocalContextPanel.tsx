import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Boxes, Folder, FolderTree, GitBranch, House, Plus, Search, X } from "lucide-react";
import type { PreviewTarget } from "@ideaspaces/conversation-ui";
import type { MentionEntry, MentionEntryKind } from "../lib/cli";
import { cn } from "../lib/cn";

// The local conversation's Context panel — Pi's read-only working set. Home (the
// folder Pi runs over, its write authority) is always present and can't be
// unmounted; below it, the mounted references the user pins as extra read-only
// context. Adding one seeds IS_MOUNTS on the next turn (conversation-mounts →
// cli.ts → pi-is-space). Sibling of the remote Keeper NotesPanel; mounts, not
// touched notes, are the local surface.

const basename = (p: string) => p.split("/").filter(Boolean).pop() || p;

const KIND_ICON: Record<MentionEntryKind, typeof Folder> = {
  file: Folder,
  folder: Folder,
  "code-repo": GitBranch,
  "ideaspace-repo": Boxes,
};

// A compact "Context · N" pill above the composer that opens the panel. Unlike
// the remote NotesTrigger it never self-hides — you always want a way in to add
// context. N is the mounted-reference count (home is implicit, always present).
export function LocalContextTrigger({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <div className="border-b border-is-border/80 px-3.5 py-2.5">
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex items-center gap-1.5 rounded-full border border-is-border bg-is-surface px-3 py-1 font-chrome text-[11px] text-is-text-secondary transition-colors hover:bg-is-surface-alt hover:text-is-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
      >
        <FolderTree size={13} strokeWidth={1.333} aria-hidden="true" />
        Context{count > 0 ? ` · ${count}` : ""}
      </button>
    </div>
  );
}

function MountRow({ path, onOpen, onRemove }: { path: string; onOpen: () => void; onRemove: () => void }) {
  return (
    <li className="group flex items-center gap-1 rounded-md pr-1 transition-colors hover:bg-is-surface-alt">
      <button
        type="button"
        onClick={onOpen}
        title={path}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
      >
        <Folder size={14} strokeWidth={1.333} className="shrink-0 text-is-text-tertiary" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-chrome text-sm text-is-text">{basename(path)}</span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Unmount ${basename(path)}`}
        className="shrink-0 rounded-md p-1 text-is-text-tertiary opacity-0 transition hover:bg-is-surface hover:text-is-text focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring group-hover:opacity-100"
      >
        <X size={14} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </li>
  );
}

// The inline folder picker: search the home tree (`ls`) for a folder to mount.
// Only folder-like entries are offered; already-mounted ones and the root itself
// are filtered out.
function AddMount({
  search,
  mountedRel,
  onPick,
}: {
  search: (query: string) => Promise<MentionEntry[]>;
  mountedRel: Set<string>;
  onPick: (relPath: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [raw, setRaw] = useState<MentionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const reqId = useRef(0);
  // `search` is an inline closure from the parent (new identity each render), so
  // hold it in a ref and key the fetch on `query` alone — otherwise the effect
  // re-queries `ls` on every parent re-render.
  const searchRef = useRef(search);
  searchRef.current = search;

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    searchRef
      .current(query)
      .then((entries) => {
        if (id !== reqId.current) return;
        setRaw(entries);
        setFailed(false);
      })
      .catch(() => {
        // A real `ls` failure (sidecar hiccup, permissions) must read
        // differently from an empty folder — surface it, don't blank out.
        if (id !== reqId.current) return;
        setRaw([]);
        setFailed(true);
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false);
      });
  }, [query]);

  // Filter at render time so pinning a folder drops it from the list instantly,
  // with no refetch. Only folder-like entries, never the root or already-mounted.
  const results = raw.filter(
    (e) => e.kind !== "file" && e.path !== "." && e.path !== "" && !mountedRel.has(e.path),
  );

  return (
    <div>
      <div className="flex items-center gap-2 rounded-md border border-is-border bg-is-surface px-2 py-1.5">
        <Search size={13} strokeWidth={1.333} className="shrink-0 text-is-text-tertiary" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Add a folder…"
          aria-label="Search folders to mount"
          className="min-w-0 flex-1 bg-transparent font-chrome text-sm text-is-text placeholder:text-is-text-tertiary focus:outline-none"
        />
      </div>
      <ul className="mt-1">
        {results.map((e) => {
          const Icon = KIND_ICON[e.kind];
          return (
            <li key={e.path}>
              <button
                type="button"
                onClick={() => onPick(e.path)}
                title={e.path}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-is-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
              >
                <Icon size={14} strokeWidth={1.333} className="shrink-0 text-is-text-tertiary" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-chrome text-sm text-is-text">{e.name}</span>
                <Plus size={13} strokeWidth={1.5} className="shrink-0 text-is-text-tertiary" aria-hidden="true" />
              </button>
            </li>
          );
        })}
        {!loading && results.length === 0 && (
          <li
            className={cn(
              "px-2 py-2 font-chrome text-xs",
              failed ? "text-is-danger-text" : "text-is-text-tertiary",
            )}
          >
            {failed
              ? "Couldn't list folders — try again."
              : query
                ? "No matching folders."
                : "No folders to add."}
          </li>
        )}
      </ul>
    </div>
  );
}

export function LocalContextPanel({
  home,
  mounts,
  search,
  onAdd,
  onRemove,
  onOpenRoot,
  onClose,
  style,
}: {
  /** The folder Pi runs over — its write authority, always present. */
  home: string;
  /** Mounted read-only references (absolute paths). */
  mounts: string[];
  /** Folder search over the home tree — `(q) => listFiles(home, q)`. */
  search: (query: string) => Promise<MentionEntry[]>;
  /** Pin a folder given as a path relative to home; returns whether it was added. */
  onAdd: (relPath: string) => void;
  onRemove: (absPath: string) => void;
  /** Preview a root (home or a mount) in the pane's preview slot. */
  onOpenRoot: (target: PreviewTarget) => void;
  onClose: () => void;
  style?: CSSProperties;
}) {
  // Relative paths already mounted, so the picker can filter them out. A mount is
  // `${home}/${rel}`; strip the home prefix back to the rel the `ls` picker uses.
  const prefix = home.endsWith("/") ? home : `${home}/`;
  const mountedRel = new Set(
    mounts.filter((m) => m.startsWith(prefix)).map((m) => m.slice(prefix.length)),
  );

  return (
    <aside
      style={style}
      className="flex min-h-0 shrink-0 flex-col border-l border-is-border bg-is-surface"
    >
      <header className="flex items-center justify-between gap-2 border-b border-is-border px-4 py-2.5">
        <p className="font-chrome text-[11px] uppercase tracking-[0.06em] text-is-text-tertiary">
          Context{mounts.length > 0 ? ` · ${mounts.length}` : ""}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close context"
          className="shrink-0 rounded-md p-1.5 text-is-text-tertiary transition hover:bg-is-surface-alt hover:text-is-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
        >
          <X size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-5">
          <section aria-label="Home">
            <p className="px-2 font-chrome text-[10px] uppercase tracking-[0.06em] text-is-text-tertiary">
              Home
            </p>
            <button
              type="button"
              onClick={() => onOpenRoot({ id: home, label: basename(home) })}
              title={home}
              className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-is-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
            >
              <House size={14} strokeWidth={1.333} className="shrink-0 text-is-text-secondary" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate font-chrome text-sm text-is-text">
                {basename(home)}
              </span>
              <span className="shrink-0 font-chrome text-[10px] uppercase tracking-[0.04em] text-is-text-tertiary">
                read-write
              </span>
            </button>
          </section>

          <section aria-label="Mounted references">
            <p className="px-2 font-chrome text-[10px] uppercase tracking-[0.06em] text-is-text-tertiary">
              Mounted (read-only){mounts.length > 0 ? ` · ${mounts.length}` : ""}
            </p>
            {mounts.length === 0 ? (
              <p className="px-2 py-2 font-chrome text-xs text-is-text-tertiary">
                No references pinned yet — add a folder below to give Pi read-only context.
              </p>
            ) : (
              <ul className="mt-1">
                {mounts.map((m) => (
                  <MountRow
                    key={m}
                    path={m}
                    onOpen={() => onOpenRoot({ id: m, label: basename(m) })}
                    onRemove={() => onRemove(m)}
                  />
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Add a reference" className={cn("border-t border-is-border/60 pt-4")}>
            <AddMount search={search} mountedRel={mountedRel} onPick={onAdd} />
          </section>
        </div>
      </div>
    </aside>
  );
}
