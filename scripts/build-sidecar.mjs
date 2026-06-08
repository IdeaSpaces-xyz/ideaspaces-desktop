// Compile the @ideaspaces/cli Node bundle into a native Tauri sidecar binary.
//
// The CLI is the desktop's backend for login/clone/sync. Tauri sidecars must be
// native executables named `<name>-<target-triple>`, so we compile the CLI's
// prebuilt esbuild bundle with `bun build --compile`. The bundle is produced by
// @ideaspaces/cli's own `prepare` script on install, so it's present in
// node_modules without a separate build step here.
//
// Run automatically by Tauri's beforeDev/beforeBuild commands; also runnable
// directly via `npm run build:sidecar`.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function fail(msg) {
  console.error(`build-sidecar: ${msg}`);
  process.exit(1);
}

// Rust host target triple (e.g. aarch64-apple-darwin) — Tauri resolves the
// sidecar by this suffix and strips it at runtime.
let triple;
try {
  const out = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
  triple = out.match(/^host:\s*(.+)$/m)?.[1]?.trim();
} catch {
  fail("`rustc` not found — install the Rust toolchain (https://rustup.rs).");
}
if (!triple) fail("could not determine Rust host triple from `rustc -vV`.");

// The CLI's `exports` field blocks subpath resolution, so resolve the bundle by
// its location under node_modules (it's a direct dependency, so it lives here,
// not hoisted away). The bundle is built by @ideaspaces/cli's prepare on install.
const bundle = join(root, "node_modules", "@ideaspaces", "cli", "bundle", "ideaspaces.js");
if (!existsSync(bundle)) {
  fail(`CLI bundle missing at ${bundle} — run \`npm install\` (prepare builds it).`);
}

const outDir = join(root, "src-tauri", "binaries");
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `ideaspaces-${triple}`);

console.log(`build-sidecar: ${bundle} -> ${out}`);
try {
  execFileSync("bun", ["build", bundle, "--compile", "--outfile", out], { stdio: "inherit" });
} catch {
  fail("`bun` compile failed — is bun installed? (https://bun.sh)");
}
console.log("build-sidecar: done.");
