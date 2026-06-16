// Pure helpers for the v2 transcript — transplanted from is_web's transcript.tsx
// (the non-component parts), split out so they're unit-testable and the
// component file exports only components.

import { isInternalToolCall } from "./tool-call-utils";
import type { KeeperHistoryMessage } from "./keeper-types";

const RESUME_GAP_MS = 8 * 60 * 60 * 1000;

export interface ToolCallWithResult {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: { content: string; is_error: boolean };
}

export type V2RenderableMessage =
  | { kind: "user"; content: string; key: string; createdAt: string }
  | {
      kind: "assistant";
      content: string;
      key: string;
      createdAt: string;
      toolCalls: ToolCallWithResult[];
    };

// Pair tool results to the assistant turn that invoked them; drop tool turns and
// content-less internal-only turns (same contract as the v1 toRenderableMessages).
export function toV2RenderableMessages(history: KeeperHistoryMessage[]): V2RenderableMessage[] {
  const resultsById = new Map<string, { content: string; is_error: boolean }>();
  for (const entry of history) {
    if (entry.role === "tool" && entry.tool_call_id) {
      resultsById.set(entry.tool_call_id, {
        content: entry.content,
        is_error: entry.is_error ?? false,
      });
    }
  }

  const messages: V2RenderableMessage[] = [];
  for (let i = 0; i < history.length; i++) {
    const entry = history[i];
    const key = `${entry.created_at}-${entry.role}-${i}`;
    if (entry.role === "user") {
      messages.push({ kind: "user", content: entry.content, key, createdAt: entry.created_at });
      continue;
    }
    if (entry.role === "assistant") {
      const toolCalls =
        entry.tool_calls
          ?.filter((call) => !isInternalToolCall(call))
          .map((call) => ({
            id: call.id,
            name: call.name,
            args: call.args,
            result: resultsById.get(call.id),
          })) ?? [];
      if (entry.content || toolCalls.length > 0) {
        messages.push({
          kind: "assistant",
          content: entry.content,
          key,
          createdAt: entry.created_at,
          toolCalls,
        });
      }
    }
  }
  return messages;
}

// A "Resumed · …" divider when two turns are >8h apart, or land on different days.
export function shouldShowResumeDivider(previousCreatedAt: string, createdAt: string): boolean {
  const previous = new Date(previousCreatedAt).getTime();
  const current = new Date(createdAt).getTime();
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return false;
  if (current - previous >= RESUME_GAP_MS) return true;
  return new Date(previousCreatedAt).toDateString() !== new Date(createdAt).toDateString();
}

export function initialFor(value: string): string {
  return value.trim().slice(0, 1).toUpperCase() || "U";
}
