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
      for (const r of results) {
        if (r.status === "fulfilled") {
          for (const c of r.value.res.conversations) {
            next.push({ ...c, repoId: r.value.repo.repo_id, repoSlug: r.value.repo.slug });
          }
        }
      }
      next.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
      setRows(next);
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
