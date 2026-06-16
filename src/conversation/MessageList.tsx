// The scrolling message timeline — transplanted from is_web
// (`src/conversation/MessageList.tsx`), trimmed for the desktop: the orchestrator
// (ConversationDetail) owns initial load / error / private states, so this only
// renders a loaded conversation plus the live stream. Shell primitives
// (Skeleton/ErrorState/Button) are replaced with desktop-native elements.

import { useEffect, useState } from "react";
import type { KeeperConversationDetail, KeeperStreamState } from "./keeper-types";
import { AssistantMessage, UserMessage, toRenderableMessages } from "./Message";
import { ToolCallList } from "./ToolCallIndicator";
import { useChatScroll } from "./useChatScroll";

export interface MessageListProps {
  detail: KeeperConversationDetail;
  streamState: KeeperStreamState;
  optimisticUserMessage?: string | null;
  statusLabel?: string | null;
  emptyLabel?: string;
  className?: string;
}

function TimelineStatus({ label }: { label: string }) {
  return (
    <div className="flex justify-start" role="status" aria-live="polite">
      <div className="inline-flex items-center gap-2 rounded-full border border-is-border bg-is-surface px-3 py-1.5 text-xs text-is-text-tertiary">
        <span
          aria-hidden="true"
          className="h-2 w-2 rounded-full bg-is-accent animate-pulse motion-reduce:animate-none"
        />
        <span>{label}</span>
      </div>
    </div>
  );
}

function ThinkingBlock({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  const [expanded, setExpanded] = useState(isStreaming);

  useEffect(() => {
    if (!isStreaming) setExpanded(false);
  }, [isStreaming]);

  if (!content) return null;

  return (
    <details
      open={expanded}
      onToggle={(e) => setExpanded((e.currentTarget as HTMLDetailsElement).open)}
      className="rounded-md border border-is-border bg-is-bg p-2"
    >
      <summary className="cursor-pointer text-[11px] uppercase tracking-wide text-is-text-tertiary">
        {isStreaming ? "Thinking…" : "Thought process"}
      </summary>
      <p className="mt-2 whitespace-pre-wrap text-xs italic text-is-text-tertiary">{content}</p>
    </details>
  );
}

export function MessageList({
  detail,
  streamState,
  optimisticUserMessage,
  statusLabel,
  emptyLabel = "Type your first message below to start this conversation.",
  className = "",
}: MessageListProps) {
  const liveText = streamState.accumulatedText;
  const liveThinking = streamState.accumulatedThinking;
  const isStreaming =
    streamState.state === "connecting" ||
    streamState.state === "generating" ||
    streamState.state === "tool_running";

  const renderable = toRenderableMessages(detail.history);
  const messageCount = renderable.length + (optimisticUserMessage ? 1 : 0);
  // Suppress the generic status pill while a named tool is running (the live
  // ToolCallList already shows it).
  const timelineStatusLabel =
    statusLabel && !(streamState.state === "tool_running" && streamState.currentTool)
      ? statusLabel
      : null;

  const { scrollContainerRef, messagesEndRef, showScrollButton, scrollToBottom } = useChatScroll({
    messageCount,
    isStreaming,
    streamingText: liveText,
  });

  const empty =
    renderable.length === 0 && !liveText && !liveThinking && !optimisticUserMessage;

  return (
    <div className={`relative min-h-0 flex-1 ${className}`}>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {streamState.state === "complete" ? "Response complete" : ""}
      </span>

      <div
        ref={scrollContainerRef}
        aria-label="Conversation messages"
        className="h-full overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <p className="max-w-sm text-sm text-is-text-tertiary">{emptyLabel}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-4">
            {renderable.map((msg) => {
              if (msg.kind === "user") {
                return <UserMessage key={msg.key} content={msg.content} />;
              }
              const hasToolCalls = (msg.toolCalls?.length ?? 0) > 0;
              if (!hasToolCalls) {
                return <AssistantMessage key={msg.key} content={msg.content} />;
              }
              return (
                <div key={msg.key} className="flex flex-col gap-2">
                  <ToolCallList toolCalls={msg.toolCalls ?? []} />
                  {msg.content && <AssistantMessage content={msg.content} />}
                </div>
              );
            })}

            {optimisticUserMessage && <UserMessage content={optimisticUserMessage} />}

            {timelineStatusLabel && <TimelineStatus label={timelineStatusLabel} />}

            {streamState.state === "tool_running" && streamState.currentTool && (
              <ToolCallList
                defaultOpen
                toolCalls={[{ id: "live", name: streamState.currentTool, args: {} }]}
              />
            )}

            {liveThinking && <ThinkingBlock content={liveThinking} isStreaming={isStreaming} />}

            {(isStreaming || liveText) && (liveText || !liveThinking) && (
              <AssistantMessage content={liveText || "…"} streaming={isStreaming} />
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {showScrollButton && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <button
            type="button"
            aria-label="Scroll to latest messages"
            onClick={scrollToBottom}
            className="rounded-full border border-is-border bg-is-surface px-3 py-1.5 text-xs text-is-text-secondary shadow-sm transition hover:text-is-text"
          >
            New ↓
          </button>
        </div>
      )}
    </div>
  );
}
