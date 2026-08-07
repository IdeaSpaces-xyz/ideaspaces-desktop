import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, MessageSquare } from "lucide-react";
import {
  createLocalConversation,
  getLocalConversation,
  listLocalConversations,
  listFiles,
  streamLocalConversation,
  type Conversation,
  type StreamHandle,
  type PiThinkingLevel,
} from "../lib/cli";
import type { KeeperConversationDetail, KeeperWorkspaceSurface } from "./keeper-types";
import { createInitialKeeperStreamState, reduceKeeperStreamState } from "./keeper-stream-state";
import { useChatScroll } from "./useChatScroll";
import { V2Transcript } from "./V2Transcript";
import { Compose } from "./Compose";
import { bucketByTime, relativeTime } from "../lib/time";
import { useToast } from "../toast/toast-context";
import { PiLogo } from "../pi/PiLogo";
import { usePiModels } from "../pi/usePiModels";
import {
  getConversationModel,
  setConversationModel,
  getDefaultModel,
  setDefaultModel,
} from "../pi/conversation-model";
import {
  getConversationMounts,
  addConversationMount,
  removeConversationMount,
  isValidMountPath,
} from "../pi/conversation-mounts";
import {
  getConversationFiles,
  addConversationFiles,
  type FileMap,
  type FileEntry,
} from "../pi/conversation-files";
import { extractMentions } from "./mentions";
import { isEditableFile, isWithinContext, resolveUnder } from "./local-file-preview";
import { basename } from "../lib/path";
import { Resizer } from "../components/Resizer";
import { LocalContextPanel, LocalContextTrigger } from "./LocalContextPanel";
import { LocalRootPreview } from "./LocalRootPreview";
import { LocalFilePreview } from "./LocalFilePreview";
import { exists } from "@tauri-apps/plugin-fs";
import type { PreviewTarget } from "@ideaspaces/conversation-ui";

// Local (Pi) conversations over a folder — the "Discuss" surface. Standalone: no
// account, no repo_id. Pi runs over `context` (the folder path); sessions live at
// `<context>/.pi/sessions/`. Reuses the same reducer + V2Transcript as the remote
// Keeper flow — the CLI emits the identical 9-event stream.
export function LocalConversations({ context, username }: { context: string; username: string }) {
  const toast = useToast();
  const { models, error: modelsError } = usePiModels();
  // Surface a genuine models-load failure — otherwise it's indistinguishable
  // from "no provider yet" (both just hide the picker). Pi is ready here, so an
  // error is unexpected and worth showing.
  useEffect(() => {
    if (modelsError) toast(`Couldn't load models: ${modelsError}`, "error");
  }, [modelsError, toast]);
  const [rows, setRows] = useState<Conversation[]>([]);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [error, setError] = useState<string | undefined>(undefined);
  // The open conversation, plus an optional first message to auto-send (a freshly
  // created one), and the model/thinking to seed the composer with — the pick a
  // fresh conversation started with, or (on reopen) the last-used pick restored
  // from settings. `null` = the list.
  const [open, setOpen] = useState<{
    id: string;
    initialSend?: { message: string; model?: string; thinkingLevel?: PiThinkingLevel };
    initialModel?: string;
    initialThinkingLevel?: PiThinkingLevel;
  } | null>(null);
  const [creating, setCreating] = useState(false);
  // The app-wide default a new conversation opens with (last model+thinking
  // used), so the composer doesn't snap back to the first model each time. Kept
  // fresh in memory: an open conversation reports its pick back via onModelUsed,
  // so the next new conversation seeds from it without a store round-trip (and
  // without a stale mount-time value — the bug this PR would otherwise reintroduce
  // after the first conversation).
  const [defaultModel, setDefaultModelState] = useState<{ model?: string; thinkingLevel?: PiThinkingLevel }>({});
  // Gate the "Talk to Pi" composer until the default has loaded, so it never
  // seeds from the first model in a race with the (slower) model-list load and
  // then ignores the default when it arrives.
  const [defaultLoaded, setDefaultLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    getDefaultModel()
      .then((d) => {
        if (alive) setDefaultModelState({ model: d.model, thinkingLevel: d.thinking });
      })
      .catch(() => {
        /* no default yet — the composer falls back to the first model */
      })
      .finally(() => {
        if (alive) setDefaultLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const r = await listLocalConversations(context);
      // Defensive newest-first sort (parity with the remote useConversations) so
      // bucketByTime's within-bucket order is correct regardless of CLI order.
      setRows([...r.conversations].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)));
      setError(undefined);
      setStatus("loaded");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, [context]);

  useEffect(() => {
    void load();
  }, [load]);

  // A new conversation is minted on the first message, then opened with it queued.
  const startNew = useCallback(
    async (text: string, model?: string, thinkingLevel?: PiThinkingLevel) => {
      if (creating) return; // guard a fast double-submit from minting two ids
      setCreating(true);
      try {
        const { conversation_id } = await createLocalConversation();
        setOpen({
          id: conversation_id,
          initialSend: { message: text, model, thinkingLevel },
          initialModel: model,
          initialThinkingLevel: thinkingLevel,
        });
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), "error");
      } finally {
        setCreating(false);
      }
    },
    [creating, toast],
  );

  if (open) {
    return (
      <LocalConversationView
        context={context}
        conversationId={open.id}
        username={username}
        initialSend={open.initialSend}
        initialModel={open.initialModel}
        initialThinkingLevel={open.initialThinkingLevel}
        onModelUsed={setDefaultModelState}
        onBack={() => {
          setOpen(null);
          void load();
        }}
      />
    );
  }

  const buckets = bucketByTime(rows, (c) => c.updated_at);

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <section aria-label="Talk to Pi" className="mb-10">
        <div className="mb-2 flex items-center gap-1.5 font-chrome text-[11px] text-is-text-tertiary">
          <PiLogo size={13} className="text-is-text-secondary" />
          <span>Pi — your local agent, over this folder</span>
        </div>
        <div className="rounded-2xl border border-is-border bg-is-surface">
          {defaultLoaded && (
            <Compose
              onSend={(t, opts) => void startNew(t, opts.model, opts.thinkingLevel)}
              onStop={() => {}}
              streaming={false}
              disabled={creating}
              placeholder="Ask Pi…"
              showModelControls={false}
              models={models}
              initialModel={defaultModel.model}
              initialThinkingLevel={defaultModel.thinkingLevel}
              mentionSource={(q) => listFiles(context, q)}
            />
          )}
        </div>
      </section>

      <h2 className="mb-3 font-chrome text-[11px] uppercase tracking-[0.08em] text-is-text-tertiary">
        Conversations
      </h2>
      {status === "loading" && <p className="text-sm text-is-text-tertiary">Loading conversations…</p>}
      {status === "error" && (
        <p className="text-sm text-is-danger-text">
          {error}{" "}
          <button
            type="button"
            className="underline underline-offset-2 hover:text-is-text"
            onClick={() => void load()}
          >
            Retry
          </button>
        </p>
      )}
      {status === "loaded" && rows.length === 0 && (
        <div className="flex flex-col items-center py-16 text-center">
          <MessageSquare size={28} strokeWidth={1.333} className="text-is-text-tertiary" aria-hidden="true" />
          <p className="mt-3 max-w-sm text-sm text-is-text-tertiary">
            No conversations yet — say something above to start.
          </p>
        </div>
      )}
      {status === "loaded" && rows.length > 0 && (
        <div className="flex flex-col gap-10">
          {buckets.map((bucket) => (
            <section key={bucket.key}>
              <p className="mb-3 font-chrome text-[11px] uppercase tracking-[0.08em] text-is-text-tertiary">
                {bucket.label}
              </p>
              <ul className="space-y-2">
                {bucket.items.map((c) => (
                  <li key={c.conversation_id}>
                    <button
                      type="button"
                      // Restore the conversation's last-used model/thinking before
                      // opening; fall back to the app-wide default (not the first
                      // model) when it never recorded one.
                      onClick={() =>
                        void getConversationModel(c.conversation_id).then((m) =>
                          setOpen({
                            id: c.conversation_id,
                            initialModel: m.model ?? defaultModel.model,
                            initialThinkingLevel: m.thinking ?? defaultModel.thinkingLevel,
                          }),
                        )
                      }
                      className="block w-full rounded-lg border border-is-border bg-is-surface px-4 py-3.5 text-left transition-colors hover:bg-is-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate font-prose text-base leading-snug text-is-text">
                          {c.name || "Untitled"}
                        </span>
                        <span className="shrink-0 font-chrome text-[11px] text-is-text-tertiary">
                          {relativeTime(c.updated_at)}
                        </span>
                      </span>
                      {c.summary && (
                        <span className="mt-1 block truncate text-sm leading-snug text-is-text-secondary">
                          {c.summary}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// One open local conversation: history + live stream + compose. Mirrors the
// remote ConversationDetail's send/reconcile/cancel flow, minus the remote-only
// clone-sync banner and notes panel (Pi writes to disk directly). Exported so
// the signed-in conversation surface can open a local Pi turn over a synced
// repo's clone path (C3b), not just the folder Discuss surface.
export function LocalConversationView({
  context,
  conversationId,
  username,
  initialSend,
  initialModel,
  initialThinkingLevel,
  onModelUsed,
  onBack,
}: {
  context: string;
  conversationId: string;
  username: string;
  initialSend?: { message: string; model?: string; thinkingLevel?: PiThinkingLevel };
  /** Seed the composer's model/thinking — a fresh conversation's pick, or the
   *  last-used pick restored on reopen. */
  initialModel?: string;
  initialThinkingLevel?: PiThinkingLevel;
  /** Report the model/thinking a turn was sent with, so the list can keep its
   *  new-conversation default fresh without re-reading the store. */
  onModelUsed?: (value: { model?: string; thinkingLevel?: PiThinkingLevel }) => void;
  onBack: () => void;
}) {
  const toast = useToast();
  const { models, error: modelsError } = usePiModels();
  useEffect(() => {
    if (modelsError) toast(`Couldn't load models: ${modelsError}`, "error");
  }, [modelsError, toast]);
  const [detail, setDetail] = useState<KeeperConversationDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [error, setError] = useState<string | undefined>(undefined);
  const [streamState, setStreamState] = useState(createInitialKeeperStreamState());
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const handleRef = useRef<StreamHandle | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The conversation's read-only working set (mounted references). Loaded once
  // and owned here: the Context panel mutates it, and each turn seeds it as
  // IS_MOUNTS. A ref mirrors it so `send` reads the current set without a store
  // round-trip and without re-creating the callback on every mount change.
  const [mounts, setMounts] = useState<string[]>([]);
  const mountsRef = useRef<string[]>([]);
  useEffect(() => {
    mountsRef.current = mounts;
  }, [mounts]);
  useEffect(() => {
    let alive = true;
    getConversationMounts(context, conversationId)
      .then((m) => {
        if (alive) setMounts(m);
      })
      .catch(() => {
        // Best-effort — a store miss just means no pinned references yet.
      });
    return () => {
      alive = false;
    };
  }, [context, conversationId]);

  // The conversation's files in context — what it's @-mentioned and what Pi read
  // or edited. Desktop-owned and durable (`get --local` doesn't persist a
  // workspace surface), accumulated after each turn. Ref-mirrored so the panel's
  // editability check reads the current set.
  const [files, setFiles] = useState<FileMap>({});
  useEffect(() => {
    let alive = true;
    getConversationFiles(context, conversationId)
      .then((f) => {
        if (alive) setFiles(f);
      })
      .catch(() => {
        // Best-effort — a store miss just means nothing touched yet.
      });
    return () => {
      alive = false;
    };
  }, [context, conversationId]);

  // Right panel — one slot, mutually exclusive: closed, the Context list, one
  // root's preview, or one file's preview (Back-to-context when opened from the
  // list). Resets on a conversation switch.
  const [panel, setPanel] = useState<
    | null
    | { kind: "context" }
    | { kind: "root"; target: PreviewTarget; fromContext: boolean }
    | { kind: "file"; target: PreviewTarget; fromContext: boolean; editable: boolean }
  >(null);
  const [panelWidth, setPanelWidth] = useState(320);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => setPanel(null), [conversationId]);

  // Pin a folder (given relative to home) as a read-only reference. Absolute so
  // pi resolves it the same regardless of cwd; comma-guarded (IS_MOUNTS delimiter).
  // Returns whether it was pinned (false = rejected), so callers can confirm.
  const addMount = useCallback(
    async (relPath: string): Promise<boolean> => {
      const abs = `${context.replace(/\/+$/, "")}/${relPath}`;
      if (!isValidMountPath(abs)) {
        toast("That path can't be mounted — paths with commas aren't supported.", "error");
        return false;
      }
      const next = await addConversationMount(context, conversationId, abs);
      if (mounted.current) setMounts(next);
      return true;
    },
    [context, conversationId, toast],
  );
  // Pin from an @-mention: same as the panel's Add, but confirm with a toast
  // since the menu closes and the Context panel may not be open to show it.
  const pinFromMention = useCallback(
    (relPath: string) => {
      void addMount(relPath).then((ok) => {
        if (ok) toast(`Pinned ${basename(relPath)} to Context`);
      });
    },
    [addMount, toast],
  );
  const removeMount = useCallback(
    async (abs: string) => {
      const next = await removeConversationMount(context, conversationId, abs);
      if (mounted.current) setMounts(next);
    },
    [context, conversationId],
  );

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const d = await getLocalConversation(context, conversationId);
      if (!mounted.current) return;
      setDetail(d);
      setStatus("loaded");
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, [context, conversationId]);

  // `get --local` on a freshly-minted id is a success with empty history (the
  // session file is created lazily on first send; findSessionFile → null →
  // empty detail, local-conversations.ts). So loading on mount is safe even for
  // a brand-new conversation — status reaches "loaded" and the queued first
  // message auto-sends; there's no error path that would strand it.
  useEffect(() => {
    void load();
  }, [load]);

  // Leaving mid-turn cancels it (SIGTERM kills the local pi process).
  useEffect(() => {
    return () => {
      void handleRef.current?.cancel();
    };
  }, [conversationId]);

  const streaming =
    streamState.state === "connecting" ||
    streamState.state === "generating" ||
    streamState.state === "tool_running";

  const send = useCallback(
    async (text: string, model?: string, thinkingLevel?: PiThinkingLevel) => {
      if (handleRef.current || sendingRef.current) return;
      sendingRef.current = true;
      setSending(true);
      setOptimistic(text);
      setStreamState({ ...createInitialKeeperStreamState(), state: "connecting" });
      let streamError: string | null = null;
      // The files pi read/edited this turn — harvested from turn_complete's
      // workspace surface (paths, classified in the CLI), accumulated below. Held
      // on an object so the assignment inside onEvent survives type-narrowing
      // (a bare `let` reassigned in a closure narrows back to its null init).
      const captured: { workspace: KeeperWorkspaceSurface | null } = { workspace: null };
      // The conversation's durable mounts ride the turn as IS_MOUNTS so pi-is-space
      // re-seeds its working set (in-session mounts reset each per-turn process).
      // Read from the ref so a mount pinned mid-session lands on the next turn.
      const handle = streamLocalConversation(
        context,
        conversationId,
        { message: text, model, piThinking: thinkingLevel },
        {
          onEvent: (e) => {
            if (e.type === "error" && typeof e.message === "string") streamError = e.message;
            if (e.type === "turn_complete") captured.workspace = e.result.workspace;
            setStreamState((s) => reduceKeeperStreamState(s, e));
          },
        },
        mountsRef.current,
      );
      handleRef.current = handle;
      try {
        await handle.done;
      } catch (err) {
        streamError = err instanceof Error ? err.message : String(err);
      }
      handleRef.current = null;
      if (streamError && mounted.current) toast(streamError, "error");
      // Remember this turn's pick — for reopening this conversation, and as the
      // app-wide default so the next new conversation opens with it too. Report
      // it to the list so its in-memory default updates now, not just on remount.
      // Only when a model actually resolved: a turn sent before the model list
      // loads has model undefined, and recording that would clobber a good
      // default (app-wide and this conversation's) with "no model".
      if (model) {
        void setConversationModel(conversationId, { model, thinking: thinkingLevel });
        void setDefaultModel({ model, thinking: thinkingLevel });
        onModelUsed?.({ model, thinkingLevel });
      }
      // Accumulate the files this turn brought into context: the @-mentions in
      // the message (the local pointer-token source — the CLI doesn't classify
      // `mentioned`, so parse the text; `workspace.mentioned` is folded in too
      // for parity/future-proofing), plus what pi read/edited. Every path is
      // CONFINED to home/mounts before use — mention tokens are freely-typed, so
      // this is the security gate that stops `@../../secret` escaping the
      // workspace — then existence-checked so the panel never lists a dead path.
      void (async () => {
        const workspace = captured.workspace;
        const raw: FileEntry[] = [
          ...extractMentions(text).map((rel) => ({ path: resolveUnder(context, rel), kind: "mentioned" as const })),
          ...(workspace?.mentioned ?? []).map((p) => ({ path: resolveUnder(context, p), kind: "mentioned" as const })),
          ...(workspace?.read ?? []).map((p) => ({ path: resolveUnder(context, p), kind: "read" as const })),
          ...[...(workspace?.modified ?? []), ...(workspace?.created ?? [])].map((p) => ({
            path: resolveUnder(context, p),
            kind: "edited" as const,
          })),
        ].filter((e) => isWithinContext(e.path, context, mountsRef.current));
        const checked: FileEntry[] = [];
        for (const e of raw) {
          try {
            if (await exists(e.path)) checked.push(e);
          } catch {
            // Unreadable (e.g. a permission error) — skip.
          }
        }
        if (checked.length === 0) return;
        const next = await addConversationFiles(context, conversationId, checked);
        if (mounted.current) setFiles(next);
      })();
      try {
        const d = await getLocalConversation(context, conversationId);
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
    [context, conversationId, toast, onModelUsed],
  );

  const stop = useCallback(() => {
    void handleRef.current?.cancel();
  }, []);

  // Auto-send a freshly created conversation's first message, once history loads.
  const autoSent = useRef(false);
  useEffect(() => {
    if (status === "loaded" && initialSend && !autoSent.current) {
      autoSent.current = true;
      void send(initialSend.message, initialSend.model, initialSend.thinkingLevel);
    }
  }, [status, initialSend, send]);

  // Auto-follow the stream, with a "New ↓" jump when the user scrolls up.
  const messageCount = (detail?.history.length ?? 0) + (optimistic ? 1 : 0);
  const { scrollContainerRef, messagesEndRef, showScrollButton, scrollToBottom } = useChatScroll({
    messageCount,
    isStreaming: streaming,
    streamingText: streamState.accumulatedText,
  });

  return (
    <div ref={containerRef} className="flex h-full min-h-0">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-col px-6 py-8">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1.5 self-start font-chrome text-xs text-is-text-tertiary transition-colors hover:text-is-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
      >
        <ArrowLeft size={14} strokeWidth={1.333} aria-hidden="true" />
        Conversations
      </button>
      <div className="relative min-h-0 flex-1">
        <div ref={scrollContainerRef} className="h-full overflow-y-auto">
          {status === "loading" && (
            <p className="text-sm text-is-text-tertiary">Loading conversation…</p>
          )}
          {status === "error" && (
            <p className="text-sm text-is-danger-text">
              {error}{" "}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-is-text"
                onClick={() => void load()}
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
              agent={{ name: "Pi", avatar: "P", role: "local agent" }}
            />
          )}
          <div ref={messagesEndRef} />
        </div>
        {showScrollButton && status === "loaded" && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
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
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl border border-is-border bg-is-surface">
        <LocalContextTrigger count={mounts.length} onOpen={() => setPanel({ kind: "context" })} />
        <Compose
          onSend={(t, opts) => void send(t, opts.model, opts.thinkingLevel)}
          onStop={stop}
          streaming={streaming}
          disabled={sending && !streaming}
          placeholder="Ask Pi…"
          showModelControls={false}
          models={models}
          initialModel={initialModel}
          initialThinkingLevel={initialThinkingLevel}
          mentionSource={(q) => listFiles(context, q)}
          onPinMount={pinFromMention}
        />
      </div>
      </div>
      {panel && (
        <>
          <Resizer
            side="right"
            min={280}
            max={760}
            label="Context panel width"
            containerRef={containerRef}
            width={panelWidth}
            onResize={setPanelWidth}
          />
          {panel.kind === "context" ? (
            <LocalContextPanel
              home={context}
              mounts={mounts}
              files={files}
              search={(q) => listFiles(context, q)}
              onAdd={(rel) => void addMount(rel)}
              onRemove={(abs) => void removeMount(abs)}
              onOpenRoot={(target) => setPanel({ kind: "root", target, fromContext: true })}
              onOpenFile={(target) =>
                setPanel({
                  kind: "file",
                  target,
                  fromContext: true,
                  editable: isEditableFile(target.id, context, mountsRef.current),
                })
              }
              onClose={() => setPanel(null)}
              style={{ width: panelWidth }}
            />
          ) : panel.kind === "root" ? (
            <LocalRootPreview
              root={panel.target.id}
              home={context}
              width={panelWidth}
              onClose={() => setPanel(null)}
              onBack={panel.fromContext ? () => setPanel({ kind: "context" }) : undefined}
            />
          ) : (
            <LocalFilePreview
              path={panel.target.id}
              home={context}
              editable={panel.editable}
              width={panelWidth}
              onClose={() => setPanel(null)}
              onBack={panel.fromContext ? () => setPanel({ kind: "context" }) : undefined}
            />
          )}
        </>
      )}
    </div>
  );
}
