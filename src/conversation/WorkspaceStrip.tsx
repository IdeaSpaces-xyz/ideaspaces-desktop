import { useEffect, useMemo } from "react";
import { Eye, FilePen, FilePlus2, type LucideIcon } from "lucide-react";
import type { KeeperWorkspaceSurface } from "./keeper-types";
import { deriveWorkspaceGroups, workspaceIsEmpty } from "./workspace-artifacts";
import type { NodeState } from "./useNodeCache";

export interface PreviewTarget {
  nodeId: string;
  label: string;
}

// The files a conversation touched, above the composer: created / modified /
// referenced chips. Names are resolved per node-id (the workspace is bare ids),
// capped so a large surface doesn't fan out unboundedly. Click → preview.
const MAX_RESOLVE = 30;

function Chip({
  id,
  label,
  Icon,
  onOpen,
}: {
  id: string;
  label: string;
  Icon: LucideIcon;
  onOpen: (target: PreviewTarget) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen({ nodeId: id, label })}
      title={label}
      className="inline-flex items-center gap-1 rounded-md border border-is-border bg-is-surface px-2 py-0.5 font-chrome text-[11px] text-is-text transition hover:border-is-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
    >
      <Icon size={11} strokeWidth={1.333} className="shrink-0 text-is-text-tertiary" aria-hidden="true" />
      <span className="max-w-[160px] truncate">{label}</span>
    </button>
  );
}

function Group({
  label,
  ids,
  Icon,
  labelOf,
  onOpen,
}: {
  label: string;
  ids: string[];
  Icon: LucideIcon;
  labelOf: (id: string) => string;
  onOpen: (target: PreviewTarget) => void;
}) {
  if (ids.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-chrome text-[10px] uppercase tracking-[0.08em] text-is-text-tertiary">
        {label}
      </span>
      {ids.map((id) => (
        <Chip key={id} id={id} label={labelOf(id)} Icon={Icon} onOpen={onOpen} />
      ))}
    </div>
  );
}

export function WorkspaceStrip({
  workspace,
  cache,
  resolve,
  onOpen,
}: {
  workspace: KeeperWorkspaceSurface;
  cache: Map<string, NodeState>;
  resolve: (nodeId: string) => void;
  onOpen: (target: PreviewTarget) => void;
}) {
  const groups = useMemo(() => deriveWorkspaceGroups(workspace), [workspace]);
  const ids = useMemo(
    () => [...groups.created, ...groups.modified, ...groups.referenced].slice(0, MAX_RESOLVE),
    [groups],
  );

  // Resolve names for the visible ids (idempotent — the cache de-dupes). `ids`
  // is memoized, so its ref is stable until the workspace changes.
  useEffect(() => {
    ids.forEach(resolve);
  }, [ids, resolve]);

  if (workspaceIsEmpty(groups)) return null;

  const labelOf = (id: string) => {
    const s = cache.get(id);
    return s?.status === "loaded" ? s.node.name_display || s.node.name : id.slice(0, 12);
  };

  return (
    // A top section of the ComposerShell — its own bottom-border separator (is_web
    // parity). The shell is opaque, so the thread no longer shows through here.
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-is-border/80 px-3.5 py-2.5">
      <Group label="Created" ids={groups.created} Icon={FilePlus2} labelOf={labelOf} onOpen={onOpen} />
      <Group label="Modified" ids={groups.modified} Icon={FilePen} labelOf={labelOf} onOpen={onOpen} />
      <Group label="Referenced" ids={groups.referenced} Icon={Eye} labelOf={labelOf} onOpen={onOpen} />
    </div>
  );
}
