import type { KeeperWorkspaceSurface } from "./keeper-types";

export interface WorkspaceGroups {
  created: string[];
  modified: string[];
  referenced: string[];
}

/**
 * Group a conversation's workspace node-ids for display: **created > modified >
 * referenced** (a node touched several ways lands in the highest-priority
 * group), deleted nodes dropped, and `referenced` = `read` + `mentioned`.
 * Mirrors is_web's deriveWorkspaceArtifactGroups.
 */
export function deriveWorkspaceGroups(ws: KeeperWorkspaceSurface): WorkspaceGroups {
  const deleted = new Set(ws.deleted);
  const seen = new Set<string>();
  const take = (ids: string[]): string[] => {
    const out: string[] = [];
    for (const id of ids) {
      if (deleted.has(id) || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  };
  return {
    created: take(ws.created),
    modified: take(ws.modified),
    referenced: take([...ws.read, ...ws.mentioned]),
  };
}

export function workspaceIsEmpty(g: WorkspaceGroups): boolean {
  return g.created.length === 0 && g.modified.length === 0 && g.referenced.length === 0;
}

/** Total distinct notes across the groups — the "Notes · N" count. */
export function workspaceArtifactCount(g: WorkspaceGroups): number {
  return g.created.length + g.modified.length + g.referenced.length;
}
