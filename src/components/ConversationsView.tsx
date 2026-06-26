import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Lock, MessageSquare, Plus, RefreshCw, X } from "lucide-react";
import { useConversations, type ConversationRow } from "../spaces/useConversations";
import { NewConversation } from "./NewConversation";
import { bucketByTime, relativeTime } from "../lib/time";
import {
  getConversation,
  listClones,
  streamConversation,
  syncClone,
  type CloneRecord,
  type Space,
  type StreamHandle,
} from "../lib/cli";
import type { KeeperConversationDetail } from "../conversation/keeper-types";
import {
  createInitialKeeperStreamState,
  reduceKeeperStreamState,
} from "../conversation/keeper-stream-state";
import { V2Transcript } from "../conversation/V2Transcript";
import { useChatScroll } from "../conversation/useChatScroll";
import { formatAbsoluteDate } from "../conversation/transcript-format";
import { Compose, type SendOptions } from "../conversation/Compose";
import { useNodeCache } from "../conversation/useNodeCache";
import { WorkspaceStrip, type PreviewTarget } from "../conversation/WorkspaceStrip";
import { ComposerShell } from "../conversation/ComposerShell";
import { PreviewPane } from "../conversation/PreviewPane";
import { Resizer } from "./Resizer";
import { ConversationAssembly } from "./ConversationAssembly";
import { useToast } from "../toast/toast-context";
import { cn } from "../lib/cn";

// The v2 reading column — header, thread, and floating composer all share it.
const COLUMN = "mx-auto max-w-[760px]";

// An opened conversation — its live chat. Loads history, renders the streaming
// transcript, and sends turns through the CLI sidecar (streamConversation →
// reducer → live thinking/tool/text slots), reconciling canonical history when
// the turn completes. Full-height: header + scrolling transcript + compose.
function ConversationDetail({
  conversation,
  onBack,
  initialSend,
  username,
}: {
  conversation: ConversationRow;
  onBack: () => void;
  // A just-created conversation's first message + chosen options — auto-sent
  // once on mount (the draft's model tier / Think carry into the first turn).
  initialSend?: { message: string } & SendOptions;
  username: string;
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
  // Async-setState guard: navigating Back unmounts mid-load/reconcile. Set true
  // on mount (not just at init) so a StrictMode remount — which runs the cleanup
  // then re-runs this effect — leaves the flag true; otherwise every async
  // result is dropped and the view sticks on "Loading conversation…".
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Coherence: a Keeper turn edits notes in the context repo server-side. If we
  // have a local clone of that repo, the user is now behind — offer to Sync. The
  // count is from the turn's `workspace` surface (created + modified + deleted).
  const [clone, setClone] = useState<CloneRecord | undefined>(undefined);
  const [pendingSync, setPendingSync] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  useEffect(() => {
    let alive = true;
    listClones()
      .then((cs) => {
        if (alive) setClone(cs.find((c) => c.repo_id === repoId));
      })
      .catch(() => {
        // No clone registry / not cloned — the changes are server-only; the
        // banner still informs, it just can't offer a local Sync.
      });
    return () => {
      alive = false;
    };
  }, [repoId]);

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
    async (text: string, opts: SendOptions) => {
      if (handleRef.current || sendingRef.current) return; // in flight or reconciling
      sendingRef.current = true;
      setSending(true);
      setOptimistic(text);
      setPendingSync(null); // a new turn supersedes the prior change banner
      setStreamState({ ...createInitialKeeperStreamState(), state: "connecting" });
      // Single error sink: a transport failure rejects `done`; a mid-turn error
      // event resolves it but is captured here. Either way, toast exactly once.
      let streamError: string | null = null;
      // Notes the turn touched in the context repo (created + modified + deleted).
      let changed = 0;
      const handle = streamConversation(
        repoId,
        convId,
        { message: text, modelTier: opts.modelTier, thinking: opts.thinking },
        {
          onEvent: (e) => {
            if (e.type === "error" && typeof e.message === "string") streamError = e.message;
            if (e.type === "turn_complete") {
              const w = e.result.workspace;
              changed = w.created.length + w.modified.length + w.deleted.length;
            }
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
      if (changed > 0 && mounted.current) setPendingSync(changed);
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

  // Pull Keeper's note edits into the local clone of the context repo.
  const pullChanges = useCallback(async () => {
    if (!clone) return; // the button is disabled while syncing, so no re-entry guard needed
    setSyncing(true);
    try {
      const res = await syncClone(clone.path);
      toast(
        res.integrated
          ? `Synced — pulled ${res.integrated} change${res.integrated === 1 ? "" : "s"}`
          : "Synced — already up to date",
      );
      if (mounted.current) setPendingSync(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      if (mounted.current) setSyncing(false);
    }
  }, [clone, toast]);

  // Auto-send the first message of a freshly created conversation, once the
  // (empty) history has loaded. Ref-guarded so it fires exactly once per mount —
  // the guard, not initialSend's identity, is what prevents a re-send.
  const autoSent = useRef(false);
  useEffect(() => {
    if (status === "loaded" && initialSend && !autoSent.current) {
      autoSent.current = true;
      void send(initialSend.message, { modelTier: initialSend.modelTier, thinking: initialSend.thinking });
    }
  }, [status, initialSend, send]);

  // Reading a conversation may be participant-gated server-side: the repo-scoped
  // list can surface a conversation you're not in (or a legacy one with no owner
  // row), so a 403 here is "private", not a failure.
  const forbidden =
    status === "error" && /\b403\b|Only Process participants|not a participant/i.test(error ?? "");

  // v2 layout: a collapsing header on scroll, auto-follow scroll with a "New ↓"
  // jump, and a measured floating composer the thread reserves space beneath.
  const [collapsed, setCollapsed] = useState(false);
  const [composerHeight, setComposerHeight] = useState(0);
  const messageCount = (detail?.history.length ?? 0) + (optimistic ? 1 : 0);
  const { scrollContainerRef, messagesEndRef, showScrollButton, scrollToBottom } = useChatScroll({
    messageCount,
    isStreaming: streaming,
    streamingText: streamState.accumulatedText,
  });
  const composerRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const update = () => setComposerHeight(el.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Workspace preview: resolve the conversation's touched nodes (names for the
  // strip, content for the pane) and open one in a resizable right-side pane.
  const { cache: nodeCacheMap, resolve: resolveNode } = useNodeCache(repoId);
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [previewWidth, setPreviewWidth] = useState(380);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => setPreview(null), [convId]);
  const openPreview = useCallback(
    (t: PreviewTarget) => {
      resolveNode(t.nodeId);
      setPreview(t);
    },
    [resolveNode],
  );

  return (
    <div ref={previewContainerRef} className="flex h-full min-h-0">
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Header — collapses to a thin bar once the thread scrolls. */}
        <div className="shrink-0 border-b border-is-border/60 px-4 sm:px-6">
          <div className={cn(COLUMN, "py-3")}>
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 font-chrome text-xs text-is-text-tertiary transition-colors hover:text-is-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
            >
              <ArrowLeft size={14} strokeWidth={1.333} aria-hidden="true" />
              Conversations
            </button>
            <h1
              className={cn(
                "truncate font-prose tracking-[-0.012em] text-is-text transition-all duration-200",
                collapsed ? "mt-1 text-lg leading-tight" : "mt-2 text-[2rem] leading-tight",
              )}
            >
              {detail?.name || conversation.name || "Untitled"}
            </h1>
            {detail && !collapsed && (
              <>
                <div className="mt-2 flex flex-wrap items-center gap-3 font-chrome text-[11px] tracking-[0.02em] text-is-text-tertiary">
                  <span>Started {detail.created_at ? formatAbsoluteDate(detail.created_at) : "recently"}</span>
                  <Dot />
                  <span className="rounded-full border border-is-border px-2.5 py-1 text-is-text-secondary">
                    {detail.model_tier || "sonnet"}
                  </span>
                </div>
                <ConversationAssembly
                  repoId={repoId}
                  conversationId={convId}
                  repoLabel={conversation.repoSlug}
                  username={username}
                />
              </>
            )}
          </div>
        </div>

        {/* Thread — the one scroll region; the composer floats over its bottom. */}
        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollContainerRef}
            onScroll={(e) => setCollapsed(e.currentTarget.scrollTop > 48)}
            role="log"
            aria-label="Conversation messages"
            className="h-full overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div className={cn(COLUMN, "px-4 py-6 sm:px-6")}>
              {status === "loading" && (
                <p className="text-sm text-is-text-tertiary">Loading conversation…</p>
              )}
              {status === "error" && forbidden && (
                <div className="flex flex-col items-center py-8 text-center">
                  <Lock size={24} strokeWidth={1.333} className="text-is-text-tertiary" aria-hidden="true" />
                  <p className="mt-3 max-w-sm text-sm text-is-text-tertiary">
                    This conversation is private — you're not a participant, so its messages aren't
                    visible here.
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
                <V2Transcript
                  detail={detail}
                  userName={username}
                  optimisticUserText={optimistic}
                  streamState={streamState}
                />
              )}
              <div ref={messagesEndRef} />
              {/* Reserve space so the last message clears the floating composer. */}
              <div aria-hidden style={{ height: composerHeight }} />
            </div>
          </div>

          {showScrollButton && status === "loaded" && (
            <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: composerHeight + 16 }}>
              <button
                type="button"
                onClick={scrollToBottom}
                aria-label="Scroll to new messages"
                className="rounded-full border border-is-border bg-is-surface px-3.5 py-1.5 font-chrome text-xs text-is-text shadow-sm transition-colors hover:bg-is-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
              >
                New ↓
              </button>
            </div>
          )}

          {status === "loaded" && detail && (
            <div
              ref={composerRef}
              className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-is-bg via-is-bg to-transparent px-4 pb-4 pt-6 sm:px-6"
            >
              <div className={COLUMN}>
                {pendingSync !== null && (
                  <div className="mb-2 flex items-center gap-2 rounded-lg border border-is-border bg-is-surface px-3 py-2 text-xs text-is-text-secondary">
                    <RefreshCw size={14} strokeWidth={1.333} className="shrink-0 text-is-text-tertiary" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      Keeper changed {pendingSync} note{pendingSync === 1 ? "" : "s"}
                      {clone ? "." : " in this repo — clone it to pull them locally."}
                    </span>
                    {clone && (
                      <button
                        type="button"
                        onClick={() => void pullChanges()}
                        disabled={syncing}
                        className="shrink-0 rounded-md px-2 py-1 font-medium text-is-accent-text transition hover:bg-is-surface-alt disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
                      >
                        {syncing ? "Downloading…" : "Download"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPendingSync(null)}
                      aria-label="Dismiss"
                      className="shrink-0 rounded-md p-1 text-is-text-tertiary transition hover:bg-is-surface-alt hover:text-is-text"
                    >
                      <X size={14} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  </div>
                )}
                <ComposerShell>
                  <WorkspaceStrip
                    workspace={detail.workspace}
                    cache={nodeCacheMap}
                    resolve={resolveNode}
                    onOpen={openPreview}
                  />
                  <Compose
                    onSend={(t, opts) => void send(t, opts)}
                    onStop={stop}
                    streaming={streaming}
                    disabled={sending && !streaming}
                  />
                </ComposerShell>
              </div>
            </div>
          )}
        </div>
      </div>
      {preview && (
        <>
          <Resizer
            side="right"
            min={320}
            max={640}
            label="Preview width"
            containerRef={previewContainerRef}
            width={previewWidth}
            onResize={setPreviewWidth}
          />
          <PreviewPane
            target={preview}
            nodeState={nodeCacheMap.get(preview.nodeId)}
            onClose={() => setPreview(null)}
            style={{ width: previewWidth }}
          />
        </>
      )}
    </div>
  );
}

function Dot() {
  return <span className="h-0.5 w-0.5 rounded-full bg-is-text-tertiary" />;
}

// The connected Conversations surface — conversations across the active context's
// repos, newest first. Click one to open the live chat, or start a new one.
export function ConversationsView({
  repos,
  reposLoading,
  username,
}: {
  repos: Space[];
  reposLoading: boolean;
  username: string;
}) {
  const { status, rows, error, truncated, reload } = useConversations(repos);
  const [selected, setSelected] = useState<ConversationRow | null>(null);
  const [creating, setCreating] = useState(false);
  // Set only for a just-created conversation, to auto-send its first message
  // with the model tier / Think chosen in the draft.
  const [initialSend, setInitialSend] = useState<({ message: string } & SendOptions) | undefined>(
    undefined,
  );
  // An open conversation belongs to the context it was opened in — drop it (and
  // any draft) on a context/repo switch so we never show one that's out of scope.
  useEffect(() => {
    setSelected(null);
    setCreating(false);
    setInitialSend(undefined);
  }, [repos]);
  // Repos still loading → repos is [] and conversations resolve to a false
  // "empty"; show loading until the repo set is known.
  const effectiveStatus = reposLoading ? "loading" : status;
  // Timeline split — Today / Yesterday / This week / … (is_web v2 parity). rows
  // arrive newest-first, which the bucketer preserves within each section.
  const buckets = useMemo(() => bucketByTime(rows, (c) => c.updated_at), [rows]);

  // Leaving a conversation clears the pending first message so reopening it
  // (as an existing row) never re-sends.
  const backToList = () => {
    setSelected(null);
    setInitialSend(undefined);
  };

  // Draft created → open it as the selected conversation and hand off its first
  // message (with the chosen model tier / Think); refresh the list so it appears
  // when you go back.
  const handleCreated = (row: ConversationRow, firstMessage: string, opts: SendOptions) => {
    setCreating(false);
    setInitialSend({ message: firstMessage, ...opts });
    setSelected(row);
    void reload();
  };

  // The draft and a selected conversation each take the full height (own scroll
  // + pinned compose), so they render outside the padded list page.
  if (creating) {
    return (
      <NewConversation repos={repos} onBack={() => setCreating(false)} onCreated={handleCreated} />
    );
  }
  if (selected) {
    return (
      <ConversationDetail
        conversation={selected}
        onBack={backToList}
        initialSend={initialSend}
        username={username}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-is-text-secondary">Conversations</h2>
        {repos.length > 0 && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-is-border bg-is-surface px-2.5 py-1.5 text-xs text-is-text-secondary transition hover:border-is-accent hover:text-is-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
          >
            <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
            New conversation
          </button>
        )}
      </div>

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
