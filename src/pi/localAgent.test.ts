import { describe, expect, it } from "vitest";
import { localPiAgent } from "./localAgent";

describe("localPiAgent", () => {
  it("synthesizes agent:<user>-pi, tagged local", () => {
    const a = localPiAgent("ernests_s");
    expect(a.node_id).toBe("agent:ernests_s-pi");
    expect(a.location).toBe("local");
    expect(a.is_default).toBe(false);
  });
});
