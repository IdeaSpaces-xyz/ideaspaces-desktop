import { useCallback, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, Pencil, X } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { NoteEditor, bodyStartOffset } from "@ideaspaces/editor";
import { webUrl } from "../editor/linkResolve";
import { useToast } from "../toast/toast-context";
import type { NodeState } from "./useNodeCache";
import type { PreviewTarget } from "./preview-target";

const noop = () => {};

// The note's body, frontmatter stripped — a clean read-only render.
function body(content: string): string {
  return content.slice(bodyStartOffset(content)).replace(/^\n+/, "");
}

/**
 * The editor IO, injected by the host so this component stays presentational —
 * the desktop writes to the local clone + syncs; a future shared version could
 * be given a hosted-API adapter instead. Absent → read-only (no pencil).
 */
export interface PreviewEdit {
  /** Load the note's editable source (the full doc, frontmatter included). */
  load: () => Promise<string>;
  /** Persist edited content; resolves once it has reached the space. */
  save: (content: string) => Promise<void>;
}

// A resizable right-side view of a workspace node. Read-only by default; when an
// `edit` adapter is supplied (the note lives in a local clone), a pencil flips
// it to the live-preview editor and Save writes through the adapter.
export function PreviewPane({
  target,
  nodeState,
  edit,
  onClose,
  onBack,
  onSaved,
  style,
}: {
  target: PreviewTarget;
  nodeState: NodeState | undefined;
  edit?: PreviewEdit;
  onClose: () => void;
  /** Return to the notes list (present only when opened from it). */
  onBack?: () => void;
  /** Called after a successful save, so the host can refresh the read view. */
  onSaved?: () => void;
  style?: CSSProperties;
}) {
  const toast = useToast();
  const node = nodeState?.status === "loaded" ? nodeState.node : undefined;
  const title = node ? node.name_display || node.name : target.label;

  // Edit state. `draftSource` seeds the editor; `draftRef` tracks live edits.
  const [editing, setEditing] = useState(false);
  const [draftSource, setDraftSource] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const draftRef = useRef("");

  const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

  const startEdit = useCallback(async () => {
    if (!edit) return;
    try {
      const content = await edit.load();
      draftRef.current = content;
      setDraftSource(content);
      setEditing(true);
    } catch (e) {
      toast(`Could not open for editing: ${errMsg(e)}`, "error");
    }
  }, [edit, toast]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setDraftSource(null);
  }, []);

  const save = useCallback(async () => {
    if (!edit || saving) return;
    // Unchanged → just leave edit mode (no empty commit, like is_web's dirty check).
    if (draftRef.current === draftSource) {
      setEditing(false);
      setDraftSource(null);
      return;
    }
    setSaving(true);
    try {
      await edit.save(draftRef.current);
      setEditing(false);
      setDraftSource(null);
      onSaved?.();
    } catch (e) {
      toast(`Save failed: ${errMsg(e)}`, "error");
    } finally {
      setSaving(false);
    }
  }, [edit, saving, draftSource, onSaved, toast]);

  // Links in the read-only preview: a web address opens the browser; an internal
  // note link can't be followed here, so say so rather than no-op silently.
  const onLink = useCallback(
    (url: string) => {
      const web = webUrl(url);
      if (web) {
        void openUrl(web).catch((err) => toast(err instanceof Error ? err.message : String(err), "error"));
      } else {
        toast("Open the note in the editor to follow this link.");
      }
    },
    [toast],
  );

  return (
    <aside
      style={style}
      className="flex min-h-0 shrink-0 flex-col border-l border-is-border bg-is-surface"
    >
      <header className="flex items-center justify-between gap-2 border-b border-is-border px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {onBack && !editing && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to notes"
              className="shrink-0 rounded-md p-1.5 text-is-text-tertiary transition hover:bg-is-surface-alt hover:text-is-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
            >
              <ArrowLeft size={16} strokeWidth={1.5} aria-hidden="true" />
            </button>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-is-text">{title}</p>
            {node && <p className="truncate text-xs text-is-text-tertiary">{node.path}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {editing ? (
            <>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={saving}
                className="rounded-md px-2.5 py-1 font-chrome text-xs text-is-text-tertiary transition hover:text-is-text disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="rounded-md bg-is-text px-2.5 py-1 font-chrome text-xs text-is-bg transition hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          ) : (
            <>
              {edit && node && (
                <button
                  type="button"
                  onClick={() => void startEdit()}
                  aria-label="Edit note"
                  title="Edit"
                  className="rounded-md p-1.5 text-is-text-tertiary transition hover:bg-is-surface-alt hover:text-is-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
                >
                  <Pencil size={15} strokeWidth={1.5} aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close preview"
                className="rounded-md p-1.5 text-is-text-tertiary transition hover:bg-is-surface-alt hover:text-is-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
              >
                <X size={16} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {editing && draftSource !== null ? (
          <NoteEditor
            key={`${node?.node_id ?? target.nodeId}:edit`}
            initialContent={draftSource}
            autoHeight
            autoFocus
            onChange={(doc) => (draftRef.current = doc)}
            onSave={() => void save()}
            onLinkClick={onLink}
          />
        ) : !nodeState || nodeState.status === "loading" ? (
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
            onLinkClick={onLink}
          />
        )}
      </div>
    </aside>
  );
}
