// Ported from the v1 Message.test.ts — toV2RenderableMessages must pair/filter
// identically (it's the same contract, with toolCalls always an array + createdAt).
import { describe, expect, it } from "vitest";
import type { KeeperHistoryMessage } from "./keeper-types";
import {
  shouldShowResumeDivider,
  toV2RenderableMessages,
  type ToolCallWithResult,
} from "./transcript-messages";

function msg(overrides: Partial<KeeperHistoryMessage>): KeeperHistoryMessage {
  return {
    role: "user",
    content: "",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("toV2RenderableMessages", () => {
  it("returns an empty list for empty history", () => {
    expect(toV2RenderableMessages([])).toEqual([]);
  });

  it("emits user messages with their timestamp", () => {
    const result = toV2RenderableMessages([
      msg({ role: "user", content: "hi", created_at: "2026-06-01T10:00:00Z" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: "user", content: "hi", createdAt: "2026-06-01T10:00:00Z" });
  });

  it("emits assistant messages with an empty toolCalls array", () => {
    const result = toV2RenderableMessages([msg({ role: "assistant", content: "hello" })]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: "assistant", content: "hello", toolCalls: [] });
  });

  it("pairs a tool result with the assistant turn that invoked it", () => {
    const result = toV2RenderableMessages([
      msg({ role: "user", content: "search" }),
      msg({
        role: "assistant",
        content: "Here is what I found.",
        tool_calls: [{ id: "t1", name: "search", args: { q: "foo" } }],
      }),
      msg({ role: "tool", tool_call_id: "t1", tool_name: "search", content: '["result-a"]' }),
    ]);
    expect(result).toHaveLength(2);
    const assistant = result[1] as { kind: "assistant"; toolCalls: ToolCallWithResult[] };
    expect(assistant.toolCalls).toEqual([
      { id: "t1", name: "search", args: { q: "foo" }, result: { content: '["result-a"]', is_error: false } },
    ]);
  });

  it("drops tool messages from the rendered list", () => {
    const result = toV2RenderableMessages([
      msg({ role: "assistant", content: "", tool_calls: [{ id: "t1", name: "x", args: {} }] }),
      msg({ role: "tool", tool_call_id: "t1", content: "ok" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("assistant");
  });

  it("filters internal tool calls", () => {
    const result = toV2RenderableMessages([
      msg({
        role: "assistant",
        content: "Done",
        tool_calls: [
          { id: "t1", name: "read", args: { path: "_agent/purpose.md" } },
          { id: "t2", name: "read", args: { path: "core/README.md" } },
        ],
      }),
      msg({ role: "tool", tool_call_id: "t1", content: "internal" }),
      msg({ role: "tool", tool_call_id: "t2", content: "public" }),
    ]);
    expect(result).toHaveLength(1);
    const assistant = result[0] as { toolCalls: ToolCallWithResult[] };
    expect(assistant.toolCalls).toEqual([
      { id: "t2", name: "read", args: { path: "core/README.md" }, result: { content: "public", is_error: false } },
    ]);
  });

  it("drops an assistant turn that is all-internal with no text", () => {
    const result = toV2RenderableMessages([
      msg({
        role: "assistant",
        content: "",
        tool_calls: [{ id: "t1", name: "read", args: { path: "_agent/purpose.md" } }],
      }),
      msg({ role: "tool", tool_call_id: "t1", content: "internal result" }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("skips assistant turns with no content and no tool calls", () => {
    expect(toV2RenderableMessages([msg({ role: "assistant", content: "" })])).toHaveLength(0);
  });

  it("leaves result undefined mid-stream (no matching tool message yet)", () => {
    const result = toV2RenderableMessages([
      msg({ role: "assistant", content: "", tool_calls: [{ id: "t1", name: "search", args: {} }] }),
    ]);
    const calls = (result[0] as { toolCalls: ToolCallWithResult[] }).toolCalls;
    expect(calls).toEqual([{ id: "t1", name: "search", args: {}, result: undefined }]);
  });

  it("emits a tool-only assistant turn (content empty, calls present)", () => {
    const result = toV2RenderableMessages([
      msg({ role: "assistant", content: "", tool_calls: [{ id: "t1", name: "search", args: {} }] }),
      msg({ role: "tool", tool_call_id: "t1", content: "done" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: "assistant", content: "" });
  });

  it("flags is_error on failed tool results", () => {
    const result = toV2RenderableMessages([
      msg({ role: "assistant", content: "", tool_calls: [{ id: "t1", name: "broken", args: {} }] }),
      msg({ role: "tool", tool_call_id: "t1", content: "boom", is_error: true }),
    ]);
    const calls = (result[0] as { toolCalls: ToolCallWithResult[] }).toolCalls;
    expect(calls[0].result).toEqual({ content: "boom", is_error: true });
  });

  it("preserves source order across a multi-turn transcript", () => {
    const result = toV2RenderableMessages([
      msg({ role: "user", content: "u1" }),
      msg({ role: "assistant", content: "a1" }),
      msg({ role: "user", content: "u2" }),
      msg({ role: "assistant", content: "a2" }),
    ]);
    expect(result.map((r) => `${r.kind}:${r.content}`)).toEqual([
      "user:u1",
      "assistant:a1",
      "user:u2",
      "assistant:a2",
    ]);
  });
});

describe("shouldShowResumeDivider", () => {
  // Midday UTC times so the local-day comparison is timezone-robust. (The
  // local-day-boundary rule under 8h is inherently tz-dependent, so it isn't
  // asserted here — the gap rule and same-session cases are deterministic.)
  it("is false within the same session (<8h, same day)", () => {
    expect(shouldShowResumeDivider("2026-06-01T12:00:00Z", "2026-06-01T13:00:00Z")).toBe(false);
  });

  it("is true after an 8h+ gap", () => {
    expect(shouldShowResumeDivider("2026-06-01T02:00:00Z", "2026-06-01T12:00:00Z")).toBe(true);
  });

  it("is false for unparseable dates", () => {
    expect(shouldShowResumeDivider("nope", "2026-06-01T12:00:00Z")).toBe(false);
  });
});
