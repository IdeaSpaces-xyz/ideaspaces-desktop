import { MessageSquare } from "lucide-react";
import { useConversations } from "../spaces/useConversations";
import { relativeTime } from "../lib/time";
import type { Space } from "../lib/cli";

// The connected Conversations surface — conversations across the active context's
// repos, newest first. Read-only list; opening a conversation is a later slice.
export function ConversationsView({
  repos,
  reposLoading,
}: {
  repos: Space[];
  reposLoading: boolean;
}) {
  const { status, rows, error, reload } = useConversations(repos);
  // Repos still loading → repos is [] and conversations resolve to a false
  // "empty"; show loading until the repo set is known.
  const effectiveStatus = reposLoading ? "loading" : status;

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <h2 className="mb-3 text-sm font-medium text-is-text-secondary">Conversations</h2>

      {effectiveStatus === "loading" && (
        <p className="text-sm text-is-text-tertiary">Loading conversations…</p>
      )}
      {effectiveStatus === "error" && (
        <p className="text-sm text-is-danger-text">
          {error}{" "}
          <button
            className="underline underline-offset-2 hover:text-is-text"
            onClick={() => void reload()}
          >
            Retry
          </button>
        </p>
      )}
      {effectiveStatus === "loaded" && (
        <>
          {error && <p className="mb-3 text-xs text-is-danger-text">{error}</p>}
          {rows.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <MessageSquare
                size={28}
                strokeWidth={1.333}
                className="text-is-text-tertiary"
                aria-hidden="true"
              />
              <p className="mt-3 max-w-sm text-sm text-is-text-tertiary">
                No conversations in this context yet.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map((c) => (
                <li
                  key={c.conversation_id}
                  className="rounded-lg border border-is-border bg-is-surface px-4 py-3"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate font-medium text-is-text">{c.name || "Untitled"}</p>
                    <span className="shrink-0 text-xs text-is-text-tertiary">
                      {relativeTime(c.updated_at)}
                    </span>
                  </div>
                  {c.summary && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-is-text-secondary">{c.summary}</p>
                  )}
                  <p className="mt-1 text-xs text-is-text-tertiary">
                    {c.repoSlug} · {c.message_count} message{c.message_count === 1 ? "" : "s"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
