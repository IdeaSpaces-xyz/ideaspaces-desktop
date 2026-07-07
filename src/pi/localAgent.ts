import type { Agent } from "../lib/cli";

// The desktop-synthesized local agent — `agent:<user>-pi`. NOT from
// `ideaspaces agents` (that lists remote/Keeper agents): Pi runs locally on this
// machine, over the active folder. Surfaced in the agent picker when pi is
// connected (C2); C3 makes selecting it route a local conversation.
export function localPiAgent(username: string): Agent {
  return {
    node_id: `agent:${username}-pi`,
    name: "Pi",
    summary: "Your local agent, running on this machine",
    can_use: true,
    is_default: false,
    location: "local",
  };
}
