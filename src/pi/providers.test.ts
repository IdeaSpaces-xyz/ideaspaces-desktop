import { describe, it, expect } from "vitest";
import { providerRows, labelFor, type PiProviderInfo } from "./providers";
import type { PiProvider } from "../lib/cli";

const known: PiProviderInfo[] = [
  { id: "anthropic", label: "Anthropic (Claude)" },
  { id: "openai", label: "OpenAI (API key)" },
];

const status = (over: Partial<PiProvider> & { name: string }): PiProvider => ({
  hasCreds: true,
  expiresAt: null,
  expired: false,
  ...over,
});

describe("providerRows (union of connectable + configured + available)", () => {
  it("marks a provider with valid creds connected and removable", () => {
    const row = providerRows(known, [status({ name: "anthropic" })]).find((r) => r.id === "anthropic");
    expect(row?.state).toBe("connected");
    expect(row?.removable).toBe(true);
  });

  it("marks an expired credential expired", () => {
    const rows = providerRows(known, [status({ name: "anthropic", expired: true })]);
    expect(rows.find((r) => r.id === "anthropic")?.state).toBe("expired");
  });

  it("marks a provider with no entry (or no creds) disconnected", () => {
    const rows = providerRows(known, [status({ name: "anthropic", hasCreds: false })]);
    expect(rows.find((r) => r.id === "anthropic")?.state).toBe("disconnected");
    expect(rows.find((r) => r.id === "openai")?.state).toBe("disconnected"); // absent entirely
  });

  // The bug this fixes: OpenAI connected via Codex OAuth reports as `openai-codex`
  // (in auth.json + models), a different id than the `openai` API-key entry.
  it("recognizes openai-codex as connected with a friendly label", () => {
    const rows = providerRows(
      known,
      [status({ name: "anthropic" }), status({ name: "openai-codex" })],
      ["anthropic", "openai-codex"],
    );
    const codex = rows.find((r) => r.id === "openai-codex");
    expect(codex?.state).toBe("connected");
    expect(codex?.label).toBe("OpenAI (ChatGPT)");
    expect(codex?.removable).toBe(true);
    // The API-key OpenAI row is still its own (not connected) entry.
    expect(rows.find((r) => r.id === "openai")?.state).toBe("disconnected");
  });

  it("counts a provider with models but no auth.json entry as connected, not removable (env/ambient)", () => {
    const rows = providerRows(known, [], ["openai"]);
    const row = rows.find((r) => r.id === "openai");
    expect(row?.state).toBe("connected");
    expect(row?.removable).toBe(false); // nothing in auth.json to pi-logout
  });

  it("does not surface an unknown provider with neither creds nor models", () => {
    const rows = providerRows(known, [status({ name: "cerebras", hasCreds: false })]);
    expect(rows.some((r) => r.id === "cerebras")).toBe(false);
  });
});

describe("labelFor", () => {
  it("maps known ids to friendly labels", () => {
    expect(labelFor("openai-codex")).toBe("OpenAI (ChatGPT)");
    expect(labelFor("ideaspaces")).toBe("IdeaSpaces");
  });

  it("title-cases an unknown id as a fallback", () => {
    expect(labelFor("cerebras")).toBe("Cerebras");
    expect(labelFor("some-new-provider")).toBe("Some New Provider");
  });
});
