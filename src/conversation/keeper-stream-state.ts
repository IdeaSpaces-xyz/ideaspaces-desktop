// Keeper stream reducer — transplanted from is_web (`src/lib/keeper-stream-state.ts`).
//
// A pure `(state, event) => state` fold over the SSE event stream. It's the
// transport-agnostic seam: the desktop parses CLI JSON-lines into the same
// `KeeperStreamEvent`s the web parses from SSE, then feeds them here. Keep it in
// sync with the web copy; both must reduce identically.

import type { KeeperStreamEvent, KeeperStreamState } from "./keeper-types";

export function createInitialKeeperStreamState(): KeeperStreamState {
  return {
    state: "idle",
    conversationId: null,
    accumulatedThinking: "",
    accumulatedText: "",
    currentTool: null,
    usage: null,
    error: null,
  };
}

export function reduceKeeperStreamState(
  state: KeeperStreamState,
  event: KeeperStreamEvent,
): KeeperStreamState {
  switch (event.type) {
    case "message_start":
      return {
        ...state,
        state: "generating",
        conversationId: event.conversation_id,
        accumulatedThinking: "",
        accumulatedText: "",
        currentTool: null,
        error: null,
      };

    case "thinking_delta": {
      const delta = typeof event.delta === "string" ? event.delta : "";
      return {
        ...state,
        state: "generating",
        accumulatedThinking: `${state.accumulatedThinking}${delta}`,
      };
    }

    case "text_delta": {
      const delta = typeof event.delta === "string" ? event.delta : "";
      return {
        ...state,
        state: "generating",
        accumulatedText: `${state.accumulatedText}${delta}`,
      };
    }

    case "tool_start":
      return {
        ...state,
        state: "tool_running",
        currentTool: event.tool_name,
      };

    case "tool_result":
      return {
        ...state,
        state: "generating",
        currentTool: null,
      };

    case "message_delta":
      // Ignore late usage deltas after terminal states.
      if (state.state === "complete" || state.state === "cancelled" || state.state === "error") {
        return state;
      }
      return {
        ...state,
        // Usage deltas are metadata-only; keep the current phase untouched.
        usage: event.usage,
      };

    case "turn_complete":
      return {
        ...state,
        state: "complete",
        // The backend's canonical final response is authoritative over the deltas.
        accumulatedText: event.result.response,
        // Keep accumulatedThinking as-is: there's no canonical final thinking
        // payload; thinking is ephemeral display state.
        currentTool: null,
        usage: event.result.usage,
        error: null,
      };

    case "cancelled":
      return {
        ...state,
        state: "cancelled",
        currentTool: null,
        error: null,
      };

    case "error":
      return {
        ...state,
        state: "error",
        currentTool: null,
        error: typeof event.message === "string" ? event.message : "Unknown stream error",
      };

    default:
      return state;
  }
}
