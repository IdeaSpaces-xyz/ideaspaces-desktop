import { defineConfig } from "vitest/config";

// Standalone config — not merged with vite.config.ts (that's an async Tauri
// config). Unit tests here are pure logic (parsers, time bucketing, slugs) that
// need no Vite plugins, path aliases, or DOM, so `node` is the right environment.
// Components / CodeMirror / Tauri IPC are out of scope — they belong in e2e.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
