import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Lock, MessageSquare } from "lucide-react";
import { useConversations, type ConversationRow } from "../spaces/useConversations";
import { bucketByTime, relativeTime } from "../lib/time";
import { getConversation, streamConversation, type Space, type StreamHandle } from "../lib/cli";
import type { KeeperConversationDetail } from "../conversation/keeper-types";
import {
  createInitialKeeperStreamState,
  reduceKeeperStreamState,
} from "../conversation/keeper-stream-state";
import { streamStatusLabel } from "../conversation/stream-status";
import { MessageList } from "../conversation/MessageList";
import { Compose } from "../conversation/Compose";
import { useToast } from "../toast/toast-context";

// An opened conversation — its live chat. Loads history, renders the streaming
// transcript, and sends turns through the CLI sidecar (streamConversation →
// reducer → live thinking/tool/text slots), reconciling canonical history when
// the turn completes. Full-height: header + scrolling transcript + compose.
function ConversationDetail({
  conversation,
  onBack,
}: {
  conversation: ConversationRow;
  onBack: () => void;
}) {
  const toast = useToast();
  const repoId = conversation.repoId;
  const convId = conversation.conversation_id;

  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [detail, setDetail] = useState<KeeperConversationDetail | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [reloadCount, setReloadCount] = useState(0);

  const [streamState, setStreamState] = useState(createInitialKeeperStreamState());
  const [optimistic, setOptimistic] = useState<string | null>(null);
  // True from a send through its post-turn reconcile. The ref is the guard (read
  // synchronously, no dep churn); the state drives Compose's disabled prop.
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const handleRef = useRef<StreamHandle | null>(null);
  // Async-setState guard: navigating Back unmounts mid-load/reconcile.
  const mounted = useRef(true);
  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  // Initial load (and explicit Retry). The post-turn reconcile is inlined in
  // `send` so it doesn't flash the loading screen over the transcript.
  const load = useCallback(async () => {
    setStatus("loading");
    setError(undefined);
    try {
      const d = await getConversation(repoId, convId);
      if (!mounted.current) return;
      setDetail(d);
      setStatus("loaded");
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, [repoId, convId]);

  useEffect(() => {
    void load();
  }, [load, reloadCount]);

  // Leaving the conversation mid-turn cancels it (kills the sidecar, which
  // DELETEs the server-side turn).
  useEffect(() => {
    return () => {
      void handleRef.current?.cancel();
    };
  }, [convId]);

  const streaming =
    streamState.state === "connecting" ||
    streamState.state === "generating" ||
    streamState.state === "tool_running";

  const send = useCallback(
    async (text: string) => {
      if (handleRef.current || sendingRef.current) return; // in flight or reconciling
      sendingRef.current = true;
      setSending(true);
      setOptimistic(text);
      setStreamState({ ...createInitialKeeperStreamState(), state: "connecting" });
      // Single error sink: a transport failure rejects `done`; a mid-turn error
      // event resolves it but is captured here. Either way, toast exactly once.
      let streamError: string | null = null;
      const handle = streamConversation(
        repoId,
        convId,
        { message: text },
        {
          onEvent: (e) => {
            if (e.type === "error" && typeof e.message === "string") streamError = e.message;
            setStreamState((s) => reduceKeeperStreamState(s, e));
          },
        },
      );
      handleRef.current = handle;
      try {
        await handle.done;
      } catch (err) {
        streamError = err instanceof Error ? err.message : String(err);
      }
      handleRef.current = null;
      if (streamError && mounted.current) toast(streamError, "error");
      // Reconcile canonical history, then clear the live + optimistic display in
      // one batch (with setDetail) so the turn never shows twice. The clear runs
      // in `finally`, so a reconcile failure still drops the orphaned partial
      // turn — the transcript reverts to last-known canonical history.
      try {
        const d = await getConversation(repoId, convId);
        if (mounted.current) setDetail(d);
      } catch (err) {
        if (mounted.current) toast(err instanceof Error ? err.message : String(err), "error");
      } finally {
        sendingRef.current = false;
        if (mounted.current) {
          setOptimistic(null);
          setStreamState(createInitialKeeperStreamState());
          setSending(false);
        }
      }
    },
    [repoId, convId, toast],
  );

  // Stop cancels the in-flight turn. The sent text isn't restored to the compose
  // box: the message persists as the user turn in the transcript through the
  // reconcile, so restoring it would duplicate it.
  const stop = useCallback(() => {
    void handleRef.current?.cancel();
  }, []);

  // Reading a conversation may be participant-gated server-side: the repo-scoped
  // list can surface a conversation you're not in (or a legacy one with no owner
  // row), so a 403 here is "private", not a failure.
  const forbidden =
    status === "error" && /\b403\b|Only Process participants|not a participant/i.test(error ?? "");

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-6">
      <header className="shrink-0 pb-3 pt-6">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1 text-xs text-is-text-tertiary transition hover:text-is-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
        >
          <ArrowLeft size={14} strokeWidth={1.333} aria-hidden="true" />
          Conversations
        </button>
        <h2 className="truncate text-lg font-medium text-is-text">
          {detail?.name || conversation.name || "Untitled"}
        </h2>
        <p className="mt-0.5 text-xs text-is-text-tertiary">{conversation.repoSlug}</p>
      </header>

      {status === "loading" && <p className="text-sm text-is-text-tertiary">Loading conversation…</p>}
      {status === "error" && forbidden && (
        <div className="flex flex-col items-center py-8 text-center">
          <Lock size={24} strokeWidth={1.333} className="text-is-text-tertiary" aria-hidden="true" />
          <p className="mt-3 max-w-sm text-sm text-is-text-tertiary">
            This conversation is private — you're not a participant, so its messages aren't visible
            here.
          </p>
        </div>
      )}
      {status === "error" && !forbidden && (
        <p className="text-sm text-is-danger-text">
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
      {status === "loaded" && detail && (
        <>
          <MessageList
            detail={detail}
            streamState={streamState}
            optimisticUserMessage={optimistic}
            statusLabel={streamStatusLabel(streamState.state, streamState.currentTool)}
            emptyLabel="No messages yet — send one below."
          />
          <Compose
            onSend={(t) => void send(t)}
            onStop={stop}
            streaming={streaming}
            disabled={sending && !streaming}
          />
        </>
      )}
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

  // A selected conversation takes the full height (its own scroll + pinned
  // compose), so it renders outside the padded list page.
  if (selected) {
    return <ConversationDetail conversation={selected} onBack={() => setSelected(null)} />;
  }

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
    </div>
  );
}
