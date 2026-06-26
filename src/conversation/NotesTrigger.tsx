import { useMemo } from "react";
import { StickyNote } from "lucide-react";
import type { KeeperWorkspaceSurface } from "./keeper-types";
import { deriveWorkspaceGroups, workspaceArtifactCount } from "./workspace-artifacts";

// A compact "Notes · N" pill above the composer that opens the right notes
// panel. Replaces the old above-composer chip strip (is_web v2 parity): the
// notes themselves now live in the panel, freeing the conversation column.
// Self-hides when the conversation has touched nothing — nothing to open.
export function NotesTrigger({
  workspace,
  onOpen,
}: {
  workspace: KeeperWorkspaceSurface;
  onOpen: () => void;
}) {
  const count = useMemo(
    () => workspaceArtifactCount(deriveWorkspaceGroups(workspace)),
    [workspace],
  );
  if (count === 0) return null;

  return (
    <div className="border-b border-is-border/80 px-3.5 py-2.5">
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex items-center gap-1.5 rounded-full border border-is-border bg-is-surface px-3 py-1 font-chrome text-[11px] text-is-text-secondary transition-colors hover:bg-is-surface-alt hover:text-is-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
      >
        <StickyNote size={13} strokeWidth={1.333} aria-hidden="true" />
        Notes · {count}
      </button>
    </div>
  );
}
