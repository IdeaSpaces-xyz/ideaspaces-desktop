import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, MessageSquare } from "lucide-react";
import {
  createLocalConversation,
  getLocalConversation,
  listLocalConversations,
  streamLocalConversation,
  type Conversation,
  type StreamHandle,
} from "../lib/cli";
import type { KeeperConversationDetail } from "./keeper-types";
import { createInitialKeeperStreamState, reduceKeeperStreamState } from "./keeper-stream-state";
import { V2Transcript } from "./V2Transcript";
import { Compose } from "./Compose";
import { bucketByTime, relativeTime } from "../lib/time";
import { useToast } from "../toast/toast-context";
import { PiLogo } from "../pi/PiLogo";

// Local (Pi) conversations over a folder — the "Discuss" surface. Standalone: no
// account, no repo_id. Pi runs over `context` (the folder path); sessions live at
// `<context>/.pi/sessions/`. Reuses the same reducer + V2Transcript as the remote
// Keeper flow — the CLI emits the identical 9-event stream.
export function LocalConversations({ context, username }: { context: string; username: string }) {
  const toast = useToast();
  const [rows, setRows] = useState<Conversation[]>([]);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [error, setError] = useState<string | undefined>(undefined);
  // The open conversation, plus an optional first message to auto-send (a freshly
  // created one). `null` = the list.
  const [open, setOpen] = useState<{ id: string; initialSend?: { message: string } } | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const r = await listLocalConversations(context);
      setRows(r.conversations);
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
    async (text: string) => {
      if (creating) return; // guard a fast double-submit from minting two ids
      setCreating(true);
      try {
        const { conversation_id } = await createLocalConversation();
        setOpen({ id: conversation_id, initialSend: { message: text } });
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
          <Compose
            onSend={(t) => void startNew(t)}
            onStop={() => {}}
            streaming={false}
            disabled={creating}
            placeholder="Ask Pi…"
            showModelControls={false}
          />
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
                      onClick={() => setOpen({ id: c.conversation_id })}
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
// clone-sync banner and notes panel (Pi writes to disk directly).
function LocalConversationView({
  context,
  conversationId,
  username,
  initialSend,
  onBack,
}: {
  context: string;
  conversationId: string;
  username: string;
  initialSend?: { message: string };
  onBack: () => void;
}) {
  const toast = useToast();
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
    async (text: string) => {
      if (handleRef.current || sendingRef.current) return;
      sendingRef.current = true;
      setSending(true);
      setOptimistic(text);
      setStreamState({ ...createInitialKeeperStreamState(), state: "connecting" });
      let streamError: string | null = null;
      const handle = streamLocalConversation(
        context,
        conversationId,
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
    [context, conversationId, toast],
  );

  const stop = useCallback(() => {
    void handleRef.current?.cancel();
  }, []);

  // Auto-send a freshly created conversation's first message, once history loads.
  const autoSent = useRef(false);
  useEffect(() => {
    if (status === "loaded" && initialSend && !autoSent.current) {
      autoSent.current = true;
      void send(initialSend.message);
    }
  }, [status, initialSend, send]);

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-col px-6 py-8">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1.5 self-start font-chrome text-xs text-is-text-tertiary transition-colors hover:text-is-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
      >
        <ArrowLeft size={14} strokeWidth={1.333} aria-hidden="true" />
        Conversations
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {status === "loading" && <p className="text-sm text-is-text-tertiary">Loading conversation…</p>}
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
      </div>
      <div className="mt-4 rounded-2xl border border-is-border bg-is-surface">
        <Compose
          onSend={(t) => void send(t)}
          onStop={stop}
          streaming={streaming}
          disabled={sending && !streaming}
          placeholder="Ask Pi…"
          showModelControls={false}
        />
      </div>
    </div>
  );
}
