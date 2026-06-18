import { type CSSProperties } from "react";
import { X } from "lucide-react";
import { NoteEditor } from "../editor/NoteEditor";
import { bodyStartOffset } from "../editor/frontmatter";
import type { NodeState } from "./useNodeCache";
import type { PreviewTarget } from "./WorkspaceStrip";

const noop = () => {};

// The note's body, frontmatter stripped — a clean read-only render.
function body(content: string): string {
  return content.slice(bodyStartOffset(content)).replace(/^\n+/, "");
}

// A resizable right-side quick-view of a workspace node. Read-only (the full
// editor is a click away if the note is in a local clone); renders the same
// live-preview look as the editor's README card.
// TODO(post-v1): an "Open in editor" affordance — resolve node.path to a local
// clone and open it in EditorSurface (disabled for remote-only repos).
export function PreviewPane({
  target,
  nodeState,
  onClose,
  style,
}: {
  target: PreviewTarget;
  nodeState: NodeState | undefined;
  onClose: () => void;
  style?: CSSProperties;
}) {
  const node = nodeState?.status === "loaded" ? nodeState.node : undefined;
  const title = node ? node.name_display || node.name : target.label;

  return (
    <aside
      style={style}
      className="flex min-h-0 shrink-0 flex-col border-l border-is-border bg-is-surface"
    >
      <header className="flex items-center justify-between gap-2 border-b border-is-border px-4 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-is-text">{title}</p>
          {node && <p className="truncate text-xs text-is-text-tertiary">{node.path}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="shrink-0 rounded-md p-1.5 text-is-text-tertiary transition hover:bg-is-surface-alt hover:text-is-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
        >
          <X size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {!nodeState || nodeState.status === "loading" ? (
          <p className="text-sm text-is-text-tertiary">Loading…</p>
        ) : nodeState.status === "error" ? (
          <p className="text-sm text-is-danger-text">{nodeState.error}</p>
        ) : (
          <NoteEditor
            key={node!.node_id}
            initialContent={body(node!.content)}
            readOnly
            autoHeight
            autoFocus={false}
            onChange={noop}
            onSave={noop}
            onLinkClick={noop}
          />
        )}
      </div>
    </aside>
  );
}
