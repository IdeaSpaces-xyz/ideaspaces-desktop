// Pure status-label mapping for a KeeperStreamState — transplanted from is_web
// (`src/conversation/stream-status.ts`). Drives the timeline status pill.
import type { KeeperStreamState } from "./keeper-types";

export function streamStatusLabel(
  state: KeeperStreamState["state"],
  currentTool: string | null,
): string | null {
  switch (state) {
    case "connecting":
      return "Connecting…";
    case "generating":
      return "Generating…";
    case "tool_running":
      return `Running ${currentTool ?? "tool"}…`;
    case "cancelled":
      return "Cancelled";
    case "complete":
    case "idle":
    case "error":
      return null;
    default:
      return null;
  }
}
