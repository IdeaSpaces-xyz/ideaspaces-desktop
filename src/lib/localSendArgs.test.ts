import { describe, it, expect } from "vitest";
import { buildLocalSendArgs } from "./cli";

describe("buildLocalSendArgs", () => {
  const base = () => buildLocalSendArgs("/ws", "c1", { message: "hi" }, []);

  it("passes the picked model as --pi-model=<ref> (NOT --model)", () => {
    // The local send reads --pi-model; --model on the local path is only a Keeper
    // event label, so a bare --model would silently no-op. Lock the exact flag.
    const args = buildLocalSendArgs("/ws", "c1", { message: "hi", model: "anthropic/claude-opus-4-1" }, []);
    expect(args).toContain("--pi-model=anthropic/claude-opus-4-1");
    expect(args).not.toContain("--model");
    expect(args.some((a) => a === "--model" || a.startsWith("--model="))).toBe(false);
  });

  it("omits --pi-model when no model is picked", () => {
    expect(base().some((a) => a.startsWith("--pi-model"))).toBe(false);
  });

  it("omits --pi-model for an empty-string model (falsy skip)", () => {
    const args = buildLocalSendArgs("/ws", "c1", { message: "hi", model: "" }, []);
    expect(args.some((a) => a.startsWith("--pi-model"))).toBe(false);
  });

  it("passes the thinking level as --pi-thinking=<level> when set", () => {
    const args = buildLocalSendArgs("/ws", "c1", { message: "hi", piThinking: "high" }, []);
    expect(args).toContain("--pi-thinking=high");
  });

  it("sends an explicit off (semantically distinct from Auto/no-flag)", () => {
    const args = buildLocalSendArgs("/ws", "c1", { message: "hi", piThinking: "off" }, []);
    expect(args).toContain("--pi-thinking=off");
  });

  it("omits --pi-thinking when unset (Auto → pi keeps its default)", () => {
    expect(base().some((a) => a.startsWith("--pi-thinking"))).toBe(false);
  });

  it("carries the core local-send flags and appends extras in order", () => {
    const args = buildLocalSendArgs("/ws", "c1", { message: "hi", model: "p/m" }, ["--ext", "/x"]);
    expect(args.slice(0, 10)).toEqual([
      "conversation",
      "send",
      "--local",
      "--context",
      "/ws",
      "--conversation",
      "c1",
      "--message",
      "hi",
      "--json",
    ]);
    // extras come after the model flag
    expect(args.slice(-3)).toEqual(["--pi-model=p/m", "--ext", "/x"]);
  });
});
