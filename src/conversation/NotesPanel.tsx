import { useEffect, useMemo, type CSSProperties } from "react";
import { FileText, X } from "lucide-react";
import type { KeeperWorkspaceSurface } from "./keeper-types";
import {
  deriveWorkspaceGroups,
  workspaceArtifactCount,
  type WorkspaceGroups,
} from "./workspace-artifacts";
import type { NodeState } from "./useNodeCache";
import type { PreviewTarget } from "@ideaspaces/conversation-ui";

// The right-side notes panel (list mode): every note the conversation touched,
// grouped Referenced / Modified / Created, as a scrollable observability
// surface. Click a row → the preview pane takes over the panel. is_web v2
// parity — replaces the cramped above-composer chip strip.
const MAX_RESOLVE = 60;

function Group({
  label,
  ids,
  nameOf,
  onOpenNote,
  accent = false,
}: {
  label: string;
  ids: string[];
  nameOf: (id: string) => string;
  onOpenNote: (target: PreviewTarget) => void;
  accent?: boolean;
}) {
  if (ids.length === 0) return null;
  return (
    <section aria-label={label}>
      <p className="px-2 font-chrome text-[10px] uppercase tracking-[0.06em] text-is-text-tertiary">
        {label} · {ids.length}
      </p>
      <ul className="mt-1">
        {ids.map((id) => {
          const name = nameOf(id);
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onOpenNote({ id, label: name })}
                title={name}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-is-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
              >
                {accent ? (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-is-accent" aria-hidden="true" />
                ) : (
                  <FileText size={14} strokeWidth={1.333} className="shrink-0 text-is-text-tertiary" aria-hidden="true" />
                )}
                <span className="truncate font-chrome text-sm text-is-text">{name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function NotesPanel({
  workspace,
  cache,
  resolve,
  onOpenNote,
  onClose,
  style,
}: {
  workspace: KeeperWorkspaceSurface;
  cache: Map<string, NodeState>;
  resolve: (nodeId: string) => void;
  onOpenNote: (target: PreviewTarget) => void;
  onClose: () => void;
  style?: CSSProperties;
}) {
  const groups: WorkspaceGroups = useMemo(() => deriveWorkspaceGroups(workspace), [workspace]);
  const total = workspaceArtifactCount(groups);
  const ids = useMemo(
    () => [...groups.created, ...groups.modified, ...groups.referenced].slice(0, MAX_RESOLVE),
    [groups],
  );

  // Resolve names for every listed node (idempotent — the cache de-dupes).
  useEffect(() => {
    ids.forEach(resolve);
  }, [ids, resolve]);

  const nameOf = (id: string) => {
    const s = cache.get(id);
    return s?.status === "loaded" ? s.node.name_display || s.node.name : id.slice(0, 12);
  };

  return (
    <aside
      style={style}
      className="flex min-h-0 shrink-0 flex-col border-l border-is-border bg-is-surface"
    >
      <header className="flex items-center justify-between gap-2 border-b border-is-border px-4 py-2.5">
        <p className="font-chrome text-[11px] uppercase tracking-[0.06em] text-is-text-tertiary">
          Notes · {total}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close notes"
          className="shrink-0 rounded-md p-1.5 text-is-text-tertiary transition hover:bg-is-surface-alt hover:text-is-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
        >
          <X size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {total === 0 ? (
          <p className="px-2 py-6 text-center font-chrome text-xs text-is-text-tertiary">
            No notes touched yet.
          </p>
        ) : (
          <div className="space-y-5">
            <Group label="Referenced" ids={groups.referenced} nameOf={nameOf} onOpenNote={onOpenNote} />
            <Group label="Modified" ids={groups.modified} nameOf={nameOf} onOpenNote={onOpenNote} accent />
            <Group label="Created" ids={groups.created} nameOf={nameOf} onOpenNote={onOpenNote} />
          </div>
        )}
      </div>
    </aside>
  );
}
