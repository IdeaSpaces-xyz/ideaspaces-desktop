// Transplanted from is_web (`src/conversation/tool-call-utils.ts`).
//
// Convention-based filtering for agent-internal resource namespaces.
// Trade-off: if user content intentionally lives under these paths, those
// tool calls will be hidden from transcript rendering as well.
const INTERNAL_PATH_PREFIXES = ["_agent/", "_skills/", "_perspectives/"];

export function isInternalToolCall(call: { name: string; args: Record<string, unknown> }): boolean {
  return Object.values(call.args)
    .filter((value): value is string => typeof value === "string")
    .some((value) => INTERNAL_PATH_PREFIXES.some((prefix) => value.startsWith(prefix)));
}
