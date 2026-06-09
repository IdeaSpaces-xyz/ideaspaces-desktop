import { useCallback, useEffect, useState } from "react";
import { listConversations, type Conversation, type Space } from "../lib/cli";

export interface ConversationRow extends Conversation {
  repoId: string;
  repoSlug: string;
}

type Status = "loading" | "loaded" | "error";

/**
 * Conversations aggregated across the given repos (the active context), newest
 * first. Conversations are repo-scoped, so this fans out one CLI call per repo
 * (Promise.allSettled — one repo failing doesn't drop the rest).
 */
export function useConversations(repos: Space[]) {
  const [status, setStatus] = useState<Status>("loading");
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setStatus("loading");
    setError(undefined);
    try {
      const results = await Promise.allSettled(
        repos.map(async (repo) => ({ repo, res: await listConversations(repo.repo_id) })),
      );
      const next: ConversationRow[] = [];
      const rejected: string[] = [];
      for (const r of results) {
        if (r.status === "fulfilled") {
          for (const c of r.value.res.conversations) {
            next.push({ ...c, repoId: r.value.repo.repo_id, repoSlug: r.value.repo.slug });
          }
        } else {
          rejected.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
        }
      }
      // allSettled never rejects, so a total failure would otherwise look like
      // an empty context. If every repo failed, surface an error instead.
      if (rejected.length > 0 && rejected.length === repos.length) {
        setError(rejected[0]);
        setStatus("error");
        return;
      }
      next.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
      setRows(next);
      // Partial failure: show what loaded, but warn the list is incomplete.
      if (rejected.length > 0) {
        setError(`${rejected.length} repo${rejected.length === 1 ? "" : "s"} couldn't be loaded.`);
      }
      setStatus("loaded");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, [repos]);

  useEffect(() => {
    void load();
  }, [load]);

  return { status, rows, error, reload: load };
}
