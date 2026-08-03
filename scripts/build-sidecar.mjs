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
//   • universal (SIDECAR_UNIVERSAL=1 or `--universal`) — for a universal app
//     build (`tauri build --target universal-apple-darwin`, i.e. our release),
//     produce all three sidecars Tauri needs: the two triple-named per-arch
//     binaries (each arch slice's cargo build resolves its own) AND the lipo'd
//     `-universal-apple-darwin` fat binary (the bundling stage copies that into
//     the app). Tauri does not lipo external binaries for us.
//
// Run automatically by Tauri's beforeDev/beforeBuild commands; also runnable
// directly via `npm run build:sidecar` (host) or with `--universal`.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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

// Guard against a STALE CLI. npm caches `github:` deps and does NOT re-fetch when
// the pinned SHA changes on a plain `npm install`, so a CLI bump can silently
// leave an old build in node_modules — and we'd compile that into the sidecar,
// shipping a CLI missing verbs the desktop needs (this is exactly what broke
// `@`-mentions: the bundled CLI had no `ls`). npm's own bookkeeping can report
// the pinned SHA even when the files on disk are stale, so instead of trusting
// it we smoke-test the bundle behaviorally: `ls` is a load-bearing, recent verb,
// so if the bundle doesn't recognize it the CLI is stale. Fail loud with the fix
// rather than compile a broken sidecar.
function assertCliFresh() {
  const probe = mkdtempSync(join(tmpdir(), "cli-freshness-"));
  try {
    const res = spawnSync(process.execPath, [bundle, "ls", probe, "--json", "--limit=1"], {
      encoding: "utf8",
    });
    const output = `${res.stdout ?? ""}${res.stderr ?? ""}`;
    if (res.status !== 0 || /unknown command/i.test(output)) {
      fail(
        "the bundled @ideaspaces/cli is stale — it's missing the `ls` verb.\n" +
          "  npm caches github: deps and won't re-fetch on a SHA bump, so a plain\n" +
          "  `npm install` can keep an old CLI. Fix with a clean install:\n" +
          "    npm ci\n" +
          "  or force just the CLI:\n" +
          "    rm -rf node_modules/@ideaspaces/cli && npm install\n" +
          "  then rebuild.",
      );
    }
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
}
assertCliFresh();

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
  // A `--target universal-apple-darwin` build needs THREE sidecars present:
  //  • the two triple-named per-arch binaries — each arch slice is a normal
  //    per-target cargo build that resolves its sidecar by triple (omitting
  //    them fails the build.rs externalBin check at compile time); and
  //  • the lipo'd `-universal-apple-darwin` fat binary — the bundling stage
  //    copies THAT into the universal app's Resources (omitting it fails with
  //    "resource path …-universal-apple-darwin doesn't exist" at bundle time).
  // Tauri does NOT lipo external binaries for us — we provide the fat one.
  const arm = join(outDir, "ideaspaces-aarch64-apple-darwin");
  const x64 = join(outDir, "ideaspaces-x86_64-apple-darwin");
  const fat = join(outDir, "ideaspaces-universal-apple-darwin");
  compile("bun-darwin-arm64", arm);
  compile("bun-darwin-x64", x64);
  console.log(`build-sidecar: lipo -> ${fat}`);
  try {
    execFileSync("lipo", ["-create", arm, x64, "-output", fat], { stdio: "inherit" });
  } catch {
    fail("`lipo` failed — universal builds need Xcode command-line tools (macOS only).");
  }
  console.log("build-sidecar: done (universal — both arch sidecars + fat binary).");
}
