import { pullClone, pushClone } from "./cli";

// Push and pull are two separate directions across the agreement boundary (the
// CLI split `sync` into `pull` and `push` for exactly this reason). The rail
// offers each explicitly; this is only the "Sync" convenience — pull *then*
// push — used where a single combined action still reads best (the "diverged"
// menu entry, the editor's publish-after-commit flow).

export interface SyncOutcome {
  integrated: number;
  pushed: number;
}

/** Integrate remote changes, then send local ones up. Pull first so the push
 *  isn't rejected for being behind; if the pull fails (e.g. a conflict), the
 *  error propagates and nothing is pushed. */
export async function pullThenPush(path: string): Promise<SyncOutcome> {
  const pulled = await pullClone(path);
  const pushed = await pushClone(path);
  return { integrated: pulled.integrated, pushed: pushed.pushed };
}
