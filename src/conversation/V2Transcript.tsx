// The editorial v2 conversation transcript — transplanted from is_web
// (`pages/v2/conversation/transcript.tsx`). Avatar-led turns in a grid (not
// bubbles), per-turn attribution (name · model badge · time), tool-call
// disclosures, resume dividers, and chat-tuned markdown. Pure presentation; the
// live surface layers an optimistic user turn + a streaming assistant turn on
// top of history.
//
// Desktop adaptation: the live assistant stays rendered through the post-turn
// `complete` state (until the parent reconciles canonical history in one batch),
// so the finished turn never blinks out during the reconcile.

import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { cn } from "../lib/cn";
import type { KeeperConversationDetail, KeeperStreamState } from "./keeper-types";
import { formatAbsoluteDate, formatDay } from "./transcript-format";
import {
  initialFor,
  shouldShowResumeDivider,
  toV2RenderableMessages,
  type ToolCallWithResult,
  type V2RenderableMessage,
} from "./transcript-messages";

interface V2TranscriptProps {
  detail: KeeperConversationDetail;
  userName: string;
  /** Live turn additions (live surface only). */
  optimisticUserText?: string | null;
  streamState?: KeeperStreamState | null;
  className?: string;
}

export function V2Transcript({
  detail,
  userName,
  optimisticUserText,
  streamState,
  className,
}: V2TranscriptProps) {
  const messages = toV2RenderableMessages(detail.history);
  const modelTier = detail.model_tier || "sonnet";

  const live = streamState?.state;
  const isStreaming = live === "connecting" || live === "generating" || live === "tool_running";
  // Keep the assistant turn on screen through `complete` (with text) until the
  // parent swaps in canonical history — avoids a one-frame gap on reconcile.
  const showLive = isStreaming || (live === "complete" && (streamState?.accumulatedText.length ?? 0) > 0);

  return (
    <div className={cn("flex flex-col gap-12", className)}>
      {messages.map((message, index) => {
        const previous = index > 0 ? messages[index - 1] : null;
        const showDivider = previous
          ? shouldShowResumeDivider(previous.createdAt, message.createdAt)
          : false;
        return (
          <div key={message.key} className="contents">
            {showDivider && <V2AsyncDivider createdAt={message.createdAt} />}
            <V2Turn message={message} userName={userName} modelTier={modelTier} />
          </div>
        );
      })}

      {optimisticUserText && (
        <V2Turn
          message={{ kind: "user", content: optimisticUserText, key: "optimistic", createdAt: "" }}
          userName={userName}
          modelTier={modelTier}
        />
      )}

      {showLive && streamState && (
        <V2LiveAssistant streamState={streamState} modelTier={modelTier} />
      )}
    </div>
  );
}

function V2LiveAssistant({
  streamState,
  modelTier,
}: {
  streamState: KeeperStreamState;
  modelTier: string;
}) {
  const hasText = streamState.accumulatedText.length > 0;
  return (
    <div className="grid grid-cols-[40px_1fr] gap-3.5">
      <V2Avatar label="K" agent />
      <div className="min-w-0">
        <V2Attribution name="Keeper" role={`Claude · ${modelTier}`} when="streaming…" />
        <div className="text-is-text">
          {hasText && <V2Markdown variant="chat">{streamState.accumulatedText}</V2Markdown>}
          {streamState.state === "tool_running" && streamState.currentTool ? (
            <ActiveIndicator label={`Running ${streamState.currentTool}…`} />
          ) : streamState.state === "complete" ? (
            // Held briefly while the parent reconciles canonical history.
            <div className="mt-2">
              <ActiveIndicator label="Saving…" />
            </div>
          ) : (
            !hasText && <ActiveIndicator label="Keeper is thinking…" />
          )}
        </div>
      </div>
    </div>
  );
}

function ActiveIndicator({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-is-border bg-is-surface px-3 py-1.5 font-chrome text-xs text-is-text-tertiary">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-is-accent motion-reduce:animate-none" />
      {label}
    </span>
  );
}

function V2Turn({
  message,
  userName,
  modelTier,
}: {
  message: V2RenderableMessage;
  userName: string;
  modelTier: string;
}) {
  if (message.kind === "user") {
    return (
      <div className="grid grid-cols-[40px_1fr] gap-3.5">
        <V2Avatar label={initialFor(userName)} />
        <div className="min-w-0">
          <V2Attribution
            name={`@${userName}`}
            when={message.createdAt ? formatAbsoluteDate(message.createdAt) : "now"}
          />
          <div className="whitespace-pre-wrap break-words font-sans text-[15px] leading-relaxed text-is-text">
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[40px_1fr] gap-3.5">
      <V2Avatar label="K" agent />
      <div className="min-w-0">
        <V2Attribution
          name="Keeper"
          role={`Claude · ${modelTier}`}
          when={formatAbsoluteDate(message.createdAt)}
        />
        <div className="text-is-text">
          {message.content && <V2Markdown variant="chat">{message.content}</V2Markdown>}
          {message.toolCalls.length > 0 && <V2ToolCalls toolCalls={message.toolCalls} />}
        </div>
      </div>
    </div>
  );
}

function V2Avatar({ label, agent = false }: { label: string; agent?: boolean }) {
  return (
    <div
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border font-chrome text-[13px] font-medium tracking-[0.01em]",
        agent
          ? "border-transparent bg-is-accent text-white"
          : "border-is-border bg-is-surface-alt text-is-text",
      )}
    >
      {label}
    </div>
  );
}

function V2Attribution({ name, role, when }: { name: string; role?: string; when: string }) {
  return (
    <div className="mb-2.5 flex flex-wrap items-baseline gap-2.5">
      <span className="font-chrome text-[13px] tracking-[0.005em] text-is-text">{name}</span>
      {role && (
        <span className="rounded border border-is-accent/40 px-1.5 py-0.5 font-chrome text-[10px] uppercase tracking-[0.06em] text-is-accent-text">
          {role}
        </span>
      )}
      <span className="font-chrome text-[11px] tracking-[0.02em] text-is-text-tertiary">{when}</span>
    </div>
  );
}

function V2AsyncDivider({ createdAt }: { createdAt: string }) {
  return (
    <div className="flex items-center gap-2.5 font-chrome text-[10px] uppercase tracking-[0.06em] text-is-text-tertiary">
      <span className="h-px flex-1 bg-is-border" />
      <span>Resumed · {formatDay(createdAt)}</span>
      <span className="h-px flex-1 bg-is-border" />
    </div>
  );
}

function V2ToolCalls({ toolCalls }: { toolCalls: ToolCallWithResult[] }) {
  return (
    <div className="mt-4 space-y-2">
      {toolCalls.map((call) => {
        const hasBody = Object.keys(call.args).length > 0 || !!call.result;
        return (
          <details
            key={call.id}
            className="overflow-hidden rounded-lg border border-is-border bg-is-surface font-chrome"
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 text-xs text-is-text-secondary hover:text-is-text [&::-webkit-details-marker]:hidden">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  call.result?.is_error
                    ? "bg-is-danger"
                    : call.result
                      ? "bg-is-text-tertiary"
                      : "bg-is-accent animate-pulse",
                )}
              />
              <span className="text-is-text">{call.name}</span>
              <span className="text-is-text-tertiary">
                {call.result?.is_error ? "error" : call.result ? "done" : "running…"}
              </span>
              {hasBody && <span className="ml-auto text-is-text-tertiary">▾</span>}
            </summary>
            {hasBody && (
              <div className="border-t border-is-border px-3.5 py-3 text-xs leading-relaxed text-is-text-tertiary">
                {Object.keys(call.args).length > 0 && (
                  <pre className="mb-2 overflow-x-auto whitespace-pre-wrap break-words rounded bg-is-bg p-2">
                    {formatJson(call.args)}
                  </pre>
                )}
                {call.result && (
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-is-bg p-2">
                    {call.result.content}
                  </pre>
                )}
              </div>
            )}
          </details>
        );
      })}
    </div>
  );
}

// Sanitized chat markdown (Inter, tight). The default rehype-sanitize schema
// strips script/iframe/event-handlers/style (verified) — model output can't
// inject into the webview.
export function V2Markdown({
  children,
  variant = "chat",
}: {
  children: string;
  variant?: "chat";
}) {
  void variant; // single variant on the desktop (chat); kept for parity with is_web
  return (
    <div className="break-words text-is-text">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={CHAT_COMPONENTS}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

type Renderer<Tag extends keyof React.JSX.IntrinsicElements> = (
  props: ComponentPropsWithoutRef<Tag> & { children?: ReactNode },
) => ReactNode;

const A: Renderer<"a"> = ({ href, ...props }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="text-is-accent-text underline decoration-is-accent-text/40 underline-offset-4 hover:decoration-is-accent-text"
    {...props}
  />
);
const CODE: Renderer<"code"> = ({ className, children, ...props }) => {
  const text = typeof children === "string" ? children : "";
  const isBlock = (className?.startsWith("language-") ?? false) || text.includes("\n");
  if (isBlock) {
    return (
      <code className={cn("font-chrome text-sm text-is-text", className)} {...props}>
        {children}
      </code>
    );
  }
  return (
    <code className="rounded bg-is-surface-alt px-1.5 py-0.5 font-chrome text-[0.85em] text-is-text" {...props}>
      {children}
    </code>
  );
};
const PRE: Renderer<"pre"> = (props) => (
  <pre
    className="my-4 overflow-x-auto rounded-lg border border-is-border bg-is-bg p-3 font-chrome text-sm first:mt-0 last:mb-0"
    {...props}
  />
);
const TABLE: Renderer<"table"> = (props) => (
  <div className="my-4 overflow-x-auto first:mt-0 last:mb-0">
    <table className="w-full border-collapse text-sm" {...props} />
  </div>
);
const HR: Renderer<"hr"> = (props) => <hr className="my-5 border-is-border" {...props} />;
const TH: Renderer<"th"> = (props) => (
  <th className="border-b border-is-border px-2 py-1 text-left font-medium text-is-text" {...props} />
);
const TD: Renderer<"td"> = (props) => (
  <td className="border-b border-is-border px-2 py-1 text-is-text-secondary" {...props} />
);

const P: Renderer<"p"> = (props) => (
  <p className="mb-[0.9em] font-sans text-[15px] leading-relaxed text-is-text last:mb-0" {...props} />
);
const H1: Renderer<"h1"> = (props) => (
  <h1 className="mb-3 mt-7 font-sans text-xl font-normal leading-tight tracking-[-0.012em] text-is-text first:mt-0" {...props} />
);
const H2: Renderer<"h2"> = (props) => (
  <h2 className="mb-2 mt-7 font-sans text-lg font-normal leading-tight tracking-[-0.01em] text-is-text first:mt-0" {...props} />
);
const H3: Renderer<"h3"> = (props) => (
  <h3 className="mb-2 mt-6 font-sans text-base font-normal leading-tight tracking-[-0.008em] text-is-text first:mt-0" {...props} />
);
const UL: Renderer<"ul"> = (props) => (
  <ul className="mb-[0.9em] list-disc space-y-1 pl-6 font-sans text-[15px] leading-relaxed text-is-text last:mb-0" {...props} />
);
const OL: Renderer<"ol"> = (props) => (
  <ol className="mb-[0.9em] list-decimal space-y-1 pl-6 font-sans text-[15px] leading-relaxed text-is-text last:mb-0" {...props} />
);
const LI: Renderer<"li"> = (props) => <li className="pl-1 marker:text-is-text-tertiary" {...props} />;
const BLOCKQUOTE: Renderer<"blockquote"> = (props) => (
  <blockquote className="my-4 border-l-2 border-is-border pl-4 font-sans text-[15px] italic leading-relaxed text-is-text-secondary first:mt-0 last:mb-0" {...props} />
);

const CHAT_COMPONENTS = {
  h1: H1,
  h2: H2,
  h3: H3,
  h4: H3,
  h5: H3,
  h6: H3,
  p: P,
  ul: UL,
  ol: OL,
  li: LI,
  blockquote: BLOCKQUOTE,
  a: A,
  code: CODE,
  pre: PRE,
  table: TABLE,
  hr: HR,
  th: TH,
  td: TD,
} as const;

function formatJson(value: Record<string, unknown>): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
