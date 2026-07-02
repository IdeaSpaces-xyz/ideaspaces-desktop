import type { CloneStatus } from "./cli";

// One vocabulary for "how does local stand against the remote" — derived once
// here and rendered the same way everywhere (repo rail, editor, conversation
// banner). Two design rules, inherited from the tools that solved this:
//   • SYNC IS DIRECTIONAL — git clients never say a bare "Sync"; they say push
//     (↑, send local up) vs pull (↓, bring remote down) vs both (diverged).
//   • SYNCED IS SILENT — the good state earns no glyph; only deviations do.
// This models the local→remote axis only. The draft→disk axis ("saving…") is a
// separate concern the editor owns; this never sees an unsaved draft.

export type SyncDirection = "none" | "push" | "pull" | "both";

export type SyncKind =
  | "synced" // local == remote, nothing pending
  | "ahead" // committed work to send up
  | "uncommitted" // local edits not yet committed (also sends up)
  | "behind" // remote work to bring down
  | "diverged"; // both directions — pull then push

export interface SyncBadge {
  kind: SyncKind;
  direction: SyncDirection;
  /** Action verb for a button. "" when there's nothing to do. */
  verb: "" | "Upload" | "Download" | "Sync";
  /** Glanceable label / tooltip, e.g. "2 to upload, 1 to download". */
  label: string;
  /** True when nothing is pending — render silently (no glyph). */
  synced: boolean;
  /** Raw counts behind the labels, so a UI can offer directional actions
   *  (Pull ↓{behind} / Push ↑{ahead}) and disable the one with nothing to do.
   *  `dirty` is uncommitted local work, which pushes up alongside `ahead`. */
  ahead: number;
  behind: number;
  dirty: boolean;
}

const SYNCED: SyncBadge = {
  kind: "synced",
  direction: "none",
  verb: "",
  label: "Synced",
  synced: true,
  ahead: 0,
  behind: 0,
  dirty: false,
};

/**
 * Map a clone's git status to the one shared sync vocabulary. `dirty` (an
 * uncommitted working tree) counts as work to send up, alongside `ahead`
 * (committed-but-unpushed) — both mean "local is ahead of the remote". `behind`
 * is remote work to bring down; having both is `diverged`.
 *
 * Fixes the old split where the editor seeded from `ahead || dirty` and silently
 * ignored `behind`, while the rail counted it — one function, no drift.
 */
export function deriveSyncBadge(status: CloneStatus): SyncBadge {
  const ahead = status.ahead ?? 0;
  const behind = status.behind ?? 0;
  const hasUp = ahead > 0 || status.dirty;
  const hasDown = behind > 0;

  if (!hasUp && !hasDown) return SYNCED;

  const up = upLabel(ahead, status.dirty);
  const down = `${behind} to download`;
  const counts = { ahead, behind, dirty: status.dirty };

  if (hasUp && hasDown) {
    return {
      kind: "diverged",
      direction: "both",
      verb: "Sync",
      label: `${up}, ${down}`,
      synced: false,
      ...counts,
    };
  }
  if (hasUp) {
    // Uncommitted edits are the "more local" state; surface that when there's
    // no committed-ahead work, since it reads more truthfully to the user.
    const kind: SyncKind = ahead > 0 ? "ahead" : "uncommitted";
    return { kind, direction: "push", verb: "Upload", label: up, synced: false, ...counts };
  }
  return { kind: "behind", direction: "pull", verb: "Download", label: down, synced: false, ...counts };
}

function upLabel(ahead: number, dirty: boolean): string {
  if (ahead > 0 && dirty) return `${ahead} to upload, uncommitted changes`;
  if (ahead > 0) return `${ahead} to upload`;
  return "uncommitted changes";
}
