import { describe, expect, it } from "vitest";
import { createInitialKeeperStreamState, reduceKeeperStreamState } from "./keeper-stream-state";
import type { KeeperStreamEvent, KeeperUsage } from "./keeper-types";

const usage: KeeperUsage = {
  input_tokens: 10,
  output_tokens: 20,
  cache_read_tokens: 0,
  cache_creation_tokens: 0,
  model_tier: "sonnet",
  total_tokens: 30,
  cost_usd: 0.01,
};

// Fold a sequence of events from the initial state — mirrors how the transport
// drives the reducer line by line.
function run(events: KeeperStreamEvent[]) {
  return events.reduce(reduceKeeperStreamState, createInitialKeeperStreamState());
}

describe("reduceKeeperStreamState", () => {
  it("starts idle with empty accumulators", () => {
    const s = createInitialKeeperStreamState();
    expect(s.state).toBe("idle");
    expect(s.accumulatedText).toBe("");
    expect(s.conversationId).toBeNull();
  });

  it("message_start enters generating, sets the id, and clears prior accumulators", () => {
    const s = run([
      { type: "text_delta", delta: "stale" },
      { type: "message_start", conversation_id: "c1", model_tier: "sonnet" },
    ]);
    expect(s.state).toBe("generating");
    expect(s.conversationId).toBe("c1");
    expect(s.accumulatedText).toBe("");
    expect(s.accumulatedThinking).toBe("");
  });

  it("accumulates thinking and text deltas in order", () => {
    const s = run([
      { type: "message_start", conversation_id: "c1", model_tier: "sonnet" },
      { type: "thinking_delta", delta: "hmm " },
      { type: "thinking_delta", delta: "ok" },
      { type: "text_delta", delta: "Hel" },
      { type: "text_delta", delta: "lo" },
    ]);
    expect(s.accumulatedThinking).toBe("hmm ok");
    expect(s.accumulatedText).toBe("Hello");
    expect(s.state).toBe("generating");
  });

  it("tracks a tool call: tool_start → tool_running, tool_result → back to generating", () => {
    const after = run([
      { type: "message_start", conversation_id: "c1", model_tier: "sonnet" },
      { type: "tool_start", tool_name: "read_note", tool_call_id: "t1", tool_args: {} },
    ]);
    expect(after.state).toBe("tool_running");
    expect(after.currentTool).toBe("read_note");

    const done = reduceKeeperStreamState(after, {
      type: "tool_result",
      tool_call_id: "t1",
      tool_name: "read_note",
      result_preview: "…",
      is_error: false,
      duration_ms: 5,
    });
    expect(done.state).toBe("generating");
    expect(done.currentTool).toBeNull();
  });

  it("message_delta records usage without changing the phase", () => {
    const s = run([
      { type: "message_start", conversation_id: "c1", model_tier: "sonnet" },
      { type: "tool_start", tool_name: "x", tool_call_id: "t1", tool_args: {} },
      { type: "message_delta", usage },
    ]);
    expect(s.usage).toEqual(usage);
    expect(s.state).toBe("tool_running"); // phase untouched by a usage delta
  });

  it("turn_complete uses the canonical response over the streamed deltas", () => {
    const s = run([
      { type: "message_start", conversation_id: "c1", model_tier: "sonnet" },
      { type: "text_delta", delta: "partial draft" },
      {
        type: "turn_complete",
        result: {
          response: "final answer",
          usage,
          tool_calls: [],
          iterations: 1,
          position: "root",
          workspace: { created: ["n1"], modified: [], deleted: [], read: [], mentioned: [] },
        },
      },
    ]);
    expect(s.state).toBe("complete");
    expect(s.accumulatedText).toBe("final answer");
    expect(s.usage).toEqual(usage);
  });

  it("ignores a late usage delta after a terminal state", () => {
    const complete = run([
      { type: "message_start", conversation_id: "c1", model_tier: "sonnet" },
      {
        type: "turn_complete",
        result: {
          response: "done",
          usage,
          tool_calls: [],
          iterations: 1,
          position: "root",
          workspace: { created: [], modified: [], deleted: [], read: [], mentioned: [] },
        },
      },
    ]);
    const after = reduceKeeperStreamState(complete, {
      type: "message_delta",
      usage: { ...usage, output_tokens: 999 },
    });
    expect(after).toBe(complete); // unchanged reference — no late mutation
  });

  it("cancelled and error are terminal and carry the message", () => {
    const cancelled = reduceKeeperStreamState(createInitialKeeperStreamState(), {
      type: "cancelled",
      reason: "user",
    });
    expect(cancelled.state).toBe("cancelled");

    const errored = reduceKeeperStreamState(createInitialKeeperStreamState(), {
      type: "error",
      error_type: "server_error",
      message: "boom",
    });
    expect(errored.state).toBe("error");
    expect(errored.error).toBe("boom");
  });

  it("leaves state untouched for an unknown event type", () => {
    const before = run([{ type: "message_start", conversation_id: "c1", model_tier: "sonnet" }]);
    const after = reduceKeeperStreamState(before, { type: "noise" } as unknown as KeeperStreamEvent);
    expect(after).toBe(before);
  });
});
