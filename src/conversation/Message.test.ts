// Ported from is_web (`src/conversation/Message.test.ts`) — toRenderableMessages
// is pure logic and must pair/filter identically to the web transcript.
import { describe, expect, it } from "vitest";
import type { KeeperHistoryMessage } from "./keeper-types";
import { toRenderableMessages } from "./Message";

function msg(overrides: Partial<KeeperHistoryMessage>): KeeperHistoryMessage {
  return {
    role: "user",
    content: "",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("toRenderableMessages", () => {
  it("returns an empty list for empty history", () => {
    expect(toRenderableMessages([])).toEqual([]);
  });

  it("emits user messages verbatim", () => {
    const result = toRenderableMessages([msg({ role: "user", content: "hi" })]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: "user", content: "hi" });
  });

  it("emits assistant messages with plain content (no tool calls)", () => {
    const result = toRenderableMessages([msg({ role: "assistant", content: "hello" })]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: "assistant", content: "hello" });
    expect((result[0] as { toolCalls?: unknown }).toolCalls).toBeUndefined();
  });

  it("pairs a tool result with the assistant turn that invoked it", () => {
    const result = toRenderableMessages([
      msg({ role: "user", content: "search" }),
      msg({
        role: "assistant",
        content: "Here is what I found.",
        tool_calls: [{ id: "t1", name: "search", args: { q: "foo" } }],
      }),
      msg({ role: "tool", tool_call_id: "t1", tool_name: "search", content: '["result-a"]' }),
    ]);
    expect(result).toHaveLength(2);
    const assistant = result[1] as {
      kind: "assistant";
      toolCalls?: { result?: { content: string; is_error: boolean } }[];
    };
    expect(assistant.kind).toBe("assistant");
    expect(assistant.toolCalls).toEqual([
      { id: "t1", name: "search", args: { q: "foo" }, result: { content: '["result-a"]', is_error: false } },
    ]);
  });

  it("drops tool messages from the rendered list (consumed by the pairing pass)", () => {
    const result = toRenderableMessages([
      msg({ role: "assistant", content: "", tool_calls: [{ id: "t1", name: "x", args: {} }] }),
      msg({ role: "tool", tool_call_id: "t1", content: "ok" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("assistant");
  });

  it("filters internal tool calls from the rendered assistant tool list", () => {
    const result = toRenderableMessages([
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
    const assistant = result[0] as { kind: "assistant"; toolCalls?: Array<{ id: string }> };
    expect(assistant.toolCalls).toEqual([
      { id: "t2", name: "read", args: { path: "core/README.md" }, result: { content: "public", is_error: false } },
    ]);
  });

  it("drops an assistant turn when all tool calls are internal and there is no text", () => {
    const result = toRenderableMessages([
      msg({
        role: "assistant",
        content: "",
        tool_calls: [{ id: "t1", name: "read", args: { path: "_agent/purpose.md" } }],
      }),
      msg({ role: "tool", tool_call_id: "t1", content: "internal result" }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("emits a tool-only assistant turn (content empty, calls present)", () => {
    const result = toRenderableMessages([
      msg({ role: "assistant", content: "", tool_calls: [{ id: "t1", name: "search", args: {} }] }),
      msg({ role: "tool", tool_call_id: "t1", content: "done" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: "assistant", content: "" });
  });

  it("skips assistant turns with no content AND no tool calls", () => {
    expect(toRenderableMessages([msg({ role: "assistant", content: "" })])).toHaveLength(0);
  });

  it("leaves result undefined when no matching tool message exists (mid-stream)", () => {
    const result = toRenderableMessages([
      msg({ role: "assistant", content: "", tool_calls: [{ id: "t1", name: "search", args: {} }] }),
    ]);
    expect(result).toHaveLength(1);
    const calls = (result[0] as { toolCalls?: { id: string; result?: unknown }[] }).toolCalls;
    expect(calls).toEqual([{ id: "t1", name: "search", args: {}, result: undefined }]);
  });

  it("flags is_error on failed tool results", () => {
    const result = toRenderableMessages([
      msg({ role: "assistant", content: "", tool_calls: [{ id: "t1", name: "broken", args: {} }] }),
      msg({ role: "tool", tool_call_id: "t1", content: "boom", is_error: true }),
    ]);
    const calls = (result[0] as { toolCalls: { result: { is_error: boolean } }[] }).toolCalls;
    expect(calls[0].result).toEqual({ content: "boom", is_error: true });
  });

  it("preserves source order across a multi-turn transcript", () => {
    const result = toRenderableMessages([
      msg({ role: "user", content: "u1" }),
      msg({ role: "assistant", content: "a1" }),
      msg({ role: "user", content: "u2" }),
      msg({ role: "assistant", content: "a2" }),
    ]);
    expect(result.map((r) => r.kind + ":" + ("content" in r ? r.content : ""))).toEqual([
      "user:u1",
      "assistant:a1",
      "user:u2",
      "assistant:a2",
    ]);
  });
});
