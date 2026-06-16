// Tool-call status rendering — transplanted from is_web
// (`src/conversation/ToolCallIndicator.tsx`). Native `<details>` for expand,
// `--is-*` tokens for color. No Radix.

import { cn } from "../lib/cn";
import { isInternalToolCall } from "./tool-call-utils";

export interface ToolCallWithResult {
  id: string;
  name: string;
  args: Record<string, unknown>;
  /** Absent while the tool is still running. */
  result?: { content: string; is_error: boolean };
}

export interface ToolCallIndicatorProps {
  call: ToolCallWithResult;
  /** Override status for live tool calls whose pair isn't in history yet. */
  running?: boolean;
}

export interface ToolCallListProps {
  toolCalls: ToolCallWithResult[];
  /** Only applies when more than one call is rendered as a grouped block. */
  defaultOpen?: boolean;
}

type Status = "running" | "error" | "done";

export function ToolCallIndicator({ call, running }: ToolCallIndicatorProps) {
  const status: Status = running
    ? "running"
    : call.result
      ? call.result.is_error
        ? "error"
        : "done"
      : "running";
  const canExpand = !!call.result || Object.keys(call.args).length > 0;

  const summary = (
    <>
      <StatusDot status={status} />
      <span className="truncate text-sm font-medium text-is-text">{call.name}</span>
      <span className="text-xs text-is-text-tertiary">{statusLabel(status)}</span>
    </>
  );

  if (!canExpand) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border border-is-border bg-is-surface px-2 py-1">
        {summary}
      </div>
    );
  }

  return (
    <details className="rounded-md border border-is-border bg-is-surface">
      <summary className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-is-text-secondary hover:text-is-text">
        {summary}
      </summary>
      <div className="border-t border-is-border px-2 py-2">
        {Object.keys(call.args).length > 0 && (
          <pre className="mb-2 overflow-x-auto whitespace-pre-wrap break-words rounded bg-is-bg p-2 font-mono text-xs text-is-text-secondary">
            {formatArgs(call.args)}
          </pre>
        )}
        {call.result && (
          <pre
            className={cn(
              "max-h-48 overflow-auto whitespace-pre-wrap break-words rounded p-2 font-mono text-xs",
              call.result.is_error
                ? "bg-is-danger/5 text-is-danger-text"
                : "bg-is-bg text-is-text-secondary",
            )}
          >
            {call.result.content}
          </pre>
        )}
      </div>
    </details>
  );
}

export function ToolCallList({ toolCalls, defaultOpen = false }: ToolCallListProps) {
  // Defensive filter — the history flow already filters, but this guards future callers.
  const visible = toolCalls.filter((call) => !isInternalToolCall(call));
  if (visible.length === 0) return null;

  if (visible.length === 1) {
    return <ToolCallIndicator call={visible[0]} />;
  }

  const runningCount = visible.filter((call) => !call.result).length;
  const errorCount = visible.filter((call) => call.result?.is_error).length;

  return (
    <details open={defaultOpen} className="rounded-md border border-is-border bg-is-surface">
      <summary className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-is-text-secondary hover:text-is-text">
        <StatusDot status={runningCount > 0 ? "running" : errorCount > 0 ? "error" : "done"} />
        <span className="text-sm font-medium text-is-text">Tools</span>
        <span className="text-xs text-is-text-tertiary">
          {visible.length} {visible.length === 1 ? "call" : "calls"}
          {runningCount > 0 ? ` · ${runningCount} running` : ""}
          {errorCount > 0 ? ` · ${errorCount} failed` : ""}
        </span>
      </summary>
      <div className="space-y-2 border-t border-is-border p-2">
        {visible.map((call) => (
          <ToolCallIndicator key={call.id} call={call} />
        ))}
      </div>
    </details>
  );
}

function StatusDot({ status }: { status: Status }) {
  const color =
    status === "error"
      ? "bg-is-danger"
      : status === "running"
        ? "bg-is-accent animate-pulse motion-reduce:animate-none"
        : "bg-is-text-tertiary";
  return <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", color)} />;
}

function statusLabel(status: Status): string {
  if (status === "running") return "running…";
  if (status === "error") return "error";
  return "done";
}

function formatArgs(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}
