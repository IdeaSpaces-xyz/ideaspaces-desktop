import { describe, expect, it } from "vitest";
import { describePi, type PiConnectState } from "./usePiStatus";
import type { PiStatus } from "../lib/cli";

const pi = (over: Partial<PiStatus> = {}): PiStatus => ({
  binary: { present: true, path: "pi", version: "0.80.3" },
  providers: [],
  configured: true,
  extensions: [],
  extensionsResolvable: false,
  ready: true,
  ...over,
});

describe("describePi", () => {
  it("connected + version when ready", () => {
    const d = describePi({ kind: "ready", pi: pi() });
    expect(d.connected).toBe(true);
    expect(d.title).toBe("Pi connected");
    expect(d.description).toContain("pi 0.80.3");
  });

  it("omits the version when unknown", () => {
    const d = describePi({ kind: "ready", pi: pi({ binary: { present: true, path: "pi", version: null } }) });
    expect(d.description).not.toContain("·");
  });

  it("prompts to install when the binary is missing", () => {
    const d = describePi({ kind: "needs-pi", pi: pi({ ready: false, binary: { present: false, path: "pi", version: null } }) });
    expect(d.connected).toBe(false);
    expect(d.description).toMatch(/install pi/i);
  });

  it("prompts for a provider when configured is false", () => {
    const d = describePi({ kind: "needs-provider", pi: pi({ ready: false, configured: false }) });
    expect(d.connected).toBe(false);
    expect(d.description).toMatch(/provider/i);
  });

  it("stays not-connected while checking or unavailable", () => {
    const states: PiConnectState[] = [{ kind: "checking" }, { kind: "unavailable", error: "x" }];
    for (const s of states) expect(describePi(s).connected).toBe(false);
  });
});
