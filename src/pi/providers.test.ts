import { describe, it, expect } from "vitest";
import { providerRows, type PiProviderInfo } from "./providers";
import type { PiProvider } from "../lib/cli";

const known: PiProviderInfo[] = [
  { id: "anthropic", label: "Anthropic (Claude)" },
  { id: "openai", label: "OpenAI" },
];

const status = (over: Partial<PiProvider> & { name: string }): PiProvider => ({
  hasCreds: true,
  expiresAt: null,
  expired: false,
  ...over,
});

describe("providerRows (join static providers with pi-status)", () => {
  it("marks a provider with valid creds connected", () => {
    const rows = providerRows(known, [status({ name: "anthropic" })]);
    expect(rows.find((r) => r.id === "anthropic")?.state).toBe("connected");
  });

  it("marks an expired credential expired (re-login fixes it)", () => {
    const rows = providerRows(known, [status({ name: "anthropic", expired: true })]);
    expect(rows.find((r) => r.id === "anthropic")?.state).toBe("expired");
  });

  it("marks a provider with no entry (or no creds) disconnected", () => {
    const rows = providerRows(known, [status({ name: "anthropic", hasCreds: false })]);
    expect(rows.find((r) => r.id === "anthropic")?.state).toBe("disconnected");
    expect(rows.find((r) => r.id === "openai")?.state).toBe("disconnected"); // absent entirely
  });

  it("surfaces a configured provider that isn't in the known list", () => {
    const rows = providerRows(known, [status({ name: "cerebras" })]);
    const extra = rows.find((r) => r.id === "cerebras");
    expect(extra).toBeDefined();
    expect(extra?.state).toBe("connected");
    expect(extra?.label).toBe("cerebras"); // labeled by raw id
  });

  it("does not surface an unknown provider that has no creds", () => {
    const rows = providerRows(known, [status({ name: "cerebras", hasCreds: false })]);
    expect(rows.some((r) => r.id === "cerebras")).toBe(false);
  });
});
