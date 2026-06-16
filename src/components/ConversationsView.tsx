import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Lock, MessageSquare } from "lucide-react";
import { useConversations, type ConversationRow } from "../spaces/useConversations";
import { bucketByTime, relativeTime } from "../lib/time";
import { getConversation, type Space } from "../lib/cli";
import type { KeeperConversationDetail } from "../conversation/keeper-types";
import { AssistantMessage, UserMessage, toRenderableMessages } from "../conversation/Message";
import { ToolCallList } from "../conversation/ToolCallIndicator";

// The conversation's message history, rendered with the transplanted Keeper
// renderers (user bubbles, assistant markdown, paired tool calls). Read-only —
// the compose box + live streaming turn land in the next slice.
function Transcript({ detail }: { detail: KeeperConversationDetail }) {
  const renderable = useMemo(() => toRenderableMessages(detail.history), [detail.history]);
  if (renderable.length === 0) {
    return <p className="mt-6 text-sm text-is-text-tertiary">No messages in this conversation yet.</p>;
  }
  return (
    <div className="mt-6 flex flex-col gap-4">
      {renderable.map((msg) => {
        if (msg.kind === "user") {
          return <UserMessage key={msg.key} content={msg.content} />;
        }
        const hasTools = (msg.toolCalls?.length ?? 0) > 0;
        if (!hasTools) {
          return <AssistantMessage key={msg.key} content={msg.content} />;
        }
        return (
          <div key={msg.key} className="flex flex-col gap-2">
            <ToolCallList toolCalls={msg.toolCalls ?? []} />
            {msg.content && <AssistantMessage content={msg.content} />}
          </div>
        );
      })}
    </div>
  );
}

// An opened conversation — its message transcript (read-only). The compose box
// + live streaming turn are the next slice; participant management returns with
// the Tier-0 write half.
function ConversationDetail({
  conversation,
  onBack,
}: {
  conversation: ConversationRow;
  onBack: () => void;
}) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [detail, setDetail] = useState<KeeperConversationDetail | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    setError(undefined);
    getConversation(conversation.repoId, conversation.conversation_id)
      .then((d) => {
        if (alive) {
          setDetail(d);
          setStatus("loaded");
        }
      })
      .catch((err) => {
        if (alive) {
          setError(err instanceof Error ? err.message : String(err));
          setStatus("error");
        }
      });
    return () => {
      alive = false;
    };
  }, [conversation.repoId, conversation.conversation_id, reloadCount]);

  // Reading a conversation may be participant-gated server-side: the repo-scoped
  // list can surface a conversation you're not in (or a legacy one with no owner
  // row), so a 403 here is "private", not a failure.
  const forbidden =
    status === "error" && /\b403\b|Only Process participants|not a participant/i.test(error ?? "");

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1 text-xs text-is-text-tertiary transition hover:text-is-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
      >
        <ArrowLeft size={14} strokeWidth={1.333} aria-hidden="true" />
        Conversations
      </button>
      <h2 className="truncate text-lg font-medium text-is-text">
        {detail?.name || conversation.name || "Untitled"}
      </h2>
      <p className="mt-0.5 text-xs text-is-text-tertiary">
        {conversation.repoSlug} · {conversation.message_count} message
        {conversation.message_count === 1 ? "" : "s"}
      </p>

      {status === "loading" && (
        <p className="mt-6 text-sm text-is-text-tertiary">Loading conversation…</p>
      )}
      {status === "error" && forbidden && (
        <div className="mt-6 flex flex-col items-center py-8 text-center">
          <Lock size={24} strokeWidth={1.333} className="text-is-text-tertiary" aria-hidden="true" />
          <p className="mt-3 max-w-sm text-sm text-is-text-tertiary">
            This conversation is private — you're not a participant, so its messages aren't visible
            here.
          </p>
        </div>
      )}
      {status === "error" && !forbidden && (
        <p className="mt-6 text-sm text-is-danger-text">
          {error}{" "}
          <button
            type="button"
            className="underline underline-offset-2 hover:text-is-text"
            onClick={() => setReloadCount((n) => n + 1)}
          >
            Retry
          </button>
        </p>
      )}
      {status === "loaded" && detail && <Transcript detail={detail} />}
    </div>
  );
}

// The connected Conversations surface — conversations across the active context's
// repos, newest first. Click one to open its roster (read-only).
export function ConversationsView({
  repos,
  reposLoading,
}: {
  repos: Space[];
  reposLoading: boolean;
}) {
  const { status, rows, error, truncated, reload } = useConversations(repos);
  const [selected, setSelected] = useState<ConversationRow | null>(null);
  // An open roster belongs to the context it was opened in — drop it on a
  // context/repo switch so we never show a conversation that's out of scope.
  useEffect(() => {
    setSelected(null);
  }, [repos]);
  // Repos still loading → repos is [] and conversations resolve to a false
  // "empty"; show loading until the repo set is known.
  const effectiveStatus = reposLoading ? "loading" : status;
  // Timeline split — Today / Yesterday / This week / … (is_web v2 parity). rows
  // arrive newest-first, which the bucketer preserves within each section.
  const buckets = useMemo(() => bucketByTime(rows, (c) => c.updated_at), [rows]);

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      {selected ? (
        <ConversationDetail conversation={selected} onBack={() => setSelected(null)} />
      ) : (
        <>
          <h2 className="mb-3 text-sm font-medium text-is-text-secondary">Conversations</h2>

          {effectiveStatus === "loading" && (
            <p className="text-sm text-is-text-tertiary">Loading conversations…</p>
          )}
          {effectiveStatus === "error" && (
            <p className="text-sm text-is-danger-text">
              {error}{" "}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-is-text"
                onClick={() => void reload()}
              >
                Retry
              </button>
            </p>
          )}
          {effectiveStatus === "loaded" && (
            <>
              {error && (
                <p className="mb-3 text-xs text-is-danger-text">
                  {error}{" "}
                  <button
                    type="button"
                    className="underline underline-offset-2 hover:text-is-text"
                    onClick={() => void reload()}
                  >
                    Retry
                  </button>
                </p>
              )}
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
                <div className="flex flex-col gap-8">
                  {buckets.map((bucket) => (
                    <section key={bucket.key}>
                      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-is-text-tertiary">
                        {bucket.label}
                      </p>
                      <ul className="flex flex-col gap-2">
                        {bucket.items.map((c) => (
                          <li key={c.conversation_id}>
                            <button
                              type="button"
                              onClick={() => setSelected(c)}
                              className="block w-full rounded-lg border border-is-border bg-is-surface px-4 py-3 text-left transition hover:border-is-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
                            >
                              <span className="flex items-baseline justify-between gap-3">
                                <span className="truncate font-medium text-is-text">{c.name || "Untitled"}</span>
                                <span className="shrink-0 text-xs text-is-text-tertiary">
                                  {relativeTime(c.updated_at)}
                                </span>
                              </span>
                              {c.summary && (
                                <span className="mt-0.5 block line-clamp-2 text-xs text-is-text-secondary">
                                  {c.summary}
                                </span>
                              )}
                              <span className="mt-1 block text-xs text-is-text-tertiary">
                                {c.repoSlug} · {c.message_count} message{c.message_count === 1 ? "" : "s"}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
              {rows.length > 0 && truncated && (
                <p className="mt-3 text-center text-xs text-is-text-tertiary">
                  Showing recent conversations.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
