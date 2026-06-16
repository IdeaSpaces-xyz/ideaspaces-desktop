/* eslint-disable react-refresh/only-export-components -- the message components and the toRenderableMessages helper live together (transplanted from is_web) */
import type { KeeperHistoryMessage } from "./keeper-types";
import { Markdown } from "./Markdown";
import type { ToolCallWithResult } from "./ToolCallIndicator";
import { isInternalToolCall } from "./tool-call-utils";

// Single-message components — transplanted from is_web (`src/conversation/Message.tsx`).
// User content stays plain `whitespace-pre-wrap` (rarely markdown); assistant
// content flows through the Markdown renderer. `toRenderableMessages` pairs tool
// result messages to their assistant's tool_calls so the transcript can render
// them inline.

export interface UserMessageProps {
  content: string;
}

export function UserMessage({ content }: UserMessageProps) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-is-surface-alt px-4 py-3 text-base text-is-text">
        {content}
      </div>
    </div>
  );
}

export interface AssistantMessageProps {
  content: string;
  /** Show a blinking cursor at the end — indicates streaming in progress. */
  streaming?: boolean;
}

export function AssistantMessage({ content, streaming }: AssistantMessageProps) {
  return (
    <div className="flex justify-start">
      <div className="min-w-0 max-w-prose">
        <Markdown streaming={streaming}>{content}</Markdown>
      </div>
    </div>
  );
}

// Convert a KeeperHistoryMessage[] into what the UI renders. Two-pass pairing:
// index tool results by tool_call_id, then walk in order attaching results to
// the assistant turn that invoked them.
export type RenderableMessage =
  | { kind: "user"; content: string; key: string }
  | {
      kind: "assistant";
      content: string;
      key: string;
      toolCalls?: ToolCallWithResult[];
    };

export function toRenderableMessages(history: KeeperHistoryMessage[]): RenderableMessage[] {
  const resultsById = new Map<string, { content: string; is_error: boolean }>();
  for (const entry of history) {
    if (entry.role === "tool" && entry.tool_call_id) {
      resultsById.set(entry.tool_call_id, {
        content: entry.content,
        is_error: entry.is_error ?? false,
      });
    }
  }

  const out: RenderableMessage[] = [];
  for (let i = 0; i < history.length; i++) {
    const entry = history[i];
    const key = `${entry.created_at}-${entry.role}-${i}`;
    if (entry.role === "user") {
      out.push({ kind: "user", content: entry.content, key });
    } else if (entry.role === "assistant") {
      const toolCalls: ToolCallWithResult[] | undefined = entry.tool_calls
        ?.filter((c) => !isInternalToolCall(c))
        .map((c) => ({
          id: c.id,
          name: c.name,
          args: c.args,
          result: resultsById.get(c.id),
        }));
      const hasToolCalls = (toolCalls?.length ?? 0) > 0;
      if (entry.content || hasToolCalls) {
        out.push({ kind: "assistant", content: entry.content, key, toolCalls });
      }
    }
    // tool messages were consumed in pass 1
  }
  return out;
}
