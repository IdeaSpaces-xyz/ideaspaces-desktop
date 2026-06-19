// Compile the @ideaspaces/cli Node bundle into a native Tauri sidecar binary.
//
// The CLI is the desktop's backend for login/clone/sync. Tauri sidecars must be
// native executables named `<name>-<target-triple>`, so we compile the CLI's
// prebuilt esbuild bundle with `bun build --compile`. The bundle is produced by
// @ideaspaces/cli's own `prepare` script on install, so it's present in
// node_modules without a separate build step here.
//
// Two modes:
//   • default — compile for the host triple (e.g. aarch64-apple-darwin). Fast;
//     used by `tauri dev` / a local `tauri build` on the current machine.
//   • universal (SIDECAR_UNIVERSAL=1 or `--universal`) — cross-compile both
//     macOS arches with bun and `lipo` them into a single fat binary named
//     `ideaspaces-universal-apple-darwin`, which is what a universal app bundle
//     (`tauri build --target universal-apple-darwin`, i.e. our release) requires.
//
// Run automatically by Tauri's beforeDev/beforeBuild commands; also runnable
// directly via `npm run build:sidecar` (host) or with `--universal`.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const universal = process.argv.includes("--universal") || process.env.SIDECAR_UNIVERSAL === "1";

function fail(msg) {
  console.error(`build-sidecar: ${msg}`);
  process.exit(1);
}

// Rust host target triple (e.g. aarch64-apple-darwin) — Tauri resolves the
// sidecar by this suffix and strips it at runtime.
let hostTriple;
try {
  const out = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
  hostTriple = out.match(/^host:\s*(.+)$/m)?.[1]?.trim();
} catch {
  fail("`rustc` not found — install the Rust toolchain (https://rustup.rs).");
}
if (!hostTriple) fail("could not determine Rust host triple from `rustc -vV`.");

// The CLI's `exports` field blocks subpath resolution, so resolve the bundle by
// its location under node_modules (it's a direct dependency, so it lives here,
// not hoisted away). The bundle is built by @ideaspaces/cli's prepare on install.
const bundle = join(root, "node_modules", "@ideaspaces", "cli", "bundle", "ideaspaces.js");
if (!existsSync(bundle)) {
  fail(`CLI bundle missing at ${bundle} — run \`npm install\` (prepare builds it).`);
}

const outDir = join(root, "src-tauri", "binaries");
mkdirSync(outDir, { recursive: true });

// bun --compile cross-target → the embedded bun runtime for that arch. The
// bundled JS is identical across arches; only the runtime differs, so the two
// outputs lipo cleanly into one fat Mach-O.
function compile(bunTarget, out) {
  console.log(`build-sidecar: ${bundle} -> ${out}${bunTarget ? ` (${bunTarget})` : ""}`);
  const args = ["build", bundle, "--compile"];
  if (bunTarget) args.push(`--target=${bunTarget}`);
  args.push("--outfile", out);
  try {
    execFileSync("bun", args, { stdio: "inherit" });
  } catch {
    fail("`bun` compile failed — is bun installed? (https://bun.sh)");
  }
}

if (!universal) {
  compile(null, join(outDir, `ideaspaces-${hostTriple}`));
  console.log("build-sidecar: done.");
} else {
  // Cross-compile each arch, then fuse with lipo. Names are intermediate; only
  // the fat `-universal-apple-darwin` binary is what Tauri's externalBin needs.
  const arm = join(outDir, "ideaspaces-arm64");
  const x64 = join(outDir, "ideaspaces-x64");
  const fat = join(outDir, "ideaspaces-universal-apple-darwin");
  compile("bun-darwin-arm64", arm);
  compile("bun-darwin-x64", x64);
  console.log(`build-sidecar: lipo -> ${fat}`);
  try {
    execFileSync("lipo", ["-create", arm, x64, "-output", fat], { stdio: "inherit" });
  } catch {
    fail("`lipo` failed — universal builds need Xcode command-line tools (macOS only).");
  }
  console.log("build-sidecar: done (universal).");
}
