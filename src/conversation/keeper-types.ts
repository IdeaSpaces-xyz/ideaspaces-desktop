// Keeper chat types — transplanted from is_web (`src/lib/keeper-types.ts`).
//
// These mirror the sw_space conversation API (the server response shapes and the
// SSE event union) and are transport-agnostic, so they're shared verbatim with
// the web client. The desktop reads the same events — just delivered as
// JSON-lines from the CLI sidecar instead of an SSE-over-fetch stream (see
// `lib/cli.ts` `streamConversation`). Kept to the streaming + detail surface the
// desktop uses; the web-only list/update/create request types are not ported.

export type ModelTier = "haiku" | "sonnet" | "opus";

export interface KeeperContextItem {
  type: "node" | "draft";
  id?: string;
  definition?: string;
}

export interface KeeperUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  model_tier: string;
  total_tokens: number;
  cost_usd: number;
}

export interface KeeperToolCallSummary {
  name: string;
  args: Record<string, unknown>;
  duration_ms: number;
  is_error: boolean;
  cost_usd?: number;
}

// node_ids the turn touched in the context repo — the two-writer coherence
// signal (`created`/`modified`/`deleted` drive "Keeper changed N notes — Sync").
export interface KeeperWorkspaceSurface {
  created: string[];
  modified: string[];
  deleted: string[];
  read: string[];
  mentioned: string[];
}

export interface KeeperTurnResult {
  response: string;
  usage: KeeperUsage;
  tool_calls: KeeperToolCallSummary[];
  iterations: number;
  position: string;
  workspace: KeeperWorkspaceSurface;
}

export interface KeeperHistoryMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  context?: { node_id?: string; path: string; name?: string; type?: string }[];
  tool_calls?: { id: string; name: string; args: Record<string, unknown> }[];
  usage?: { input_tokens: number; output_tokens: number; cost_usd: number };
  tool_call_id?: string;
  tool_name?: string;
  is_error?: boolean;
  created_at: string;
}

export interface KeeperActiveTurn {
  task_id: string;
  status: "running";
  started_at: string;
  event_count: number;
}

export interface KeeperConversationDetail {
  conversation_id: string;
  repo_id: string;
  /** Owner identity ref (`person:…`). Present on Process/Space conversations. */
  owner?: string;
  /** Coordination Space this belongs to, when it's a Space conversation. */
  space_node_id?: string;
  name: string;
  summary: string;
  path: string | null;
  tags: string[];
  attached_to: string[];
  attached_notes: string[];
  accessibility: string[];
  contributed_by: string[];
  model_tier: string;
  turn_count: number;
  ephemeral: boolean;
  active_turn: KeeperActiveTurn | null;
  history: KeeperHistoryMessage[];
  workspace: KeeperWorkspaceSurface;
  created_at: string | null;
  updated_at: string | null;
}

export interface KeeperSendMessageRequest {
  message: string;
  context?: KeeperContextItem[];
  model_tier?: ModelTier;
  thinking?: boolean;
}

export interface KeeperCancelResponse {
  status: "cancelling" | "no_active_request";
  conversation_id: string;
}

export const KEEPER_STREAM_EVENT_TYPES = [
  "message_start",
  "thinking_delta",
  "text_delta",
  "tool_start",
  "tool_result",
  "message_delta",
  "turn_complete",
  "cancelled",
  "error",
] as const;

export type KeeperStreamEventType = (typeof KEEPER_STREAM_EVENT_TYPES)[number];

export interface KeeperMessageStartEvent {
  type: "message_start";
  conversation_id: string;
  model_tier: string;
}

export interface KeeperThinkingDeltaEvent {
  type: "thinking_delta";
  delta: string;
}

export interface KeeperTextDeltaEvent {
  type: "text_delta";
  delta: string;
}

export interface KeeperToolStartEvent {
  type: "tool_start";
  tool_name: string;
  tool_call_id: string;
  tool_args: Record<string, unknown>;
}

export interface KeeperToolResultEvent {
  type: "tool_result";
  tool_call_id: string;
  tool_name: string;
  result_preview: string;
  is_error: boolean;
  duration_ms: number;
}

export interface KeeperMessageDeltaEvent {
  type: "message_delta";
  usage: KeeperUsage;
}

export interface KeeperTurnCompleteEvent {
  type: "turn_complete";
  result: KeeperTurnResult;
  name?: string;
}

export interface KeeperCancelledEvent {
  type: "cancelled";
  reason: string;
}

export interface KeeperErrorEvent {
  type: "error";
  error_type: string;
  message: string;
}

export type KeeperStreamEvent =
  | KeeperMessageStartEvent
  | KeeperThinkingDeltaEvent
  | KeeperTextDeltaEvent
  | KeeperToolStartEvent
  | KeeperToolResultEvent
  | KeeperMessageDeltaEvent
  | KeeperTurnCompleteEvent
  | KeeperCancelledEvent
  | KeeperErrorEvent;

export type KeeperStreamPhase =
  | "idle"
  | "connecting"
  | "generating"
  | "tool_running"
  | "complete"
  | "cancelled"
  | "error";

export interface KeeperStreamState {
  state: KeeperStreamPhase;
  conversationId: string | null;
  accumulatedThinking: string;
  accumulatedText: string;
  currentTool: string | null;
  usage: KeeperUsage | null;
  error: string | null;
}
