// Fetch the pinned, prebuilt pi binary and stage it as a 2nd Tauri sidecar.
//
// Connect Pi's local agent is the `pi` runtime (github.com/badlogic/pi-mono).
// pi ships bun-`--compile` single-file per-arch binaries as GitHub Release
// assets, so — unlike the ideaspaces CLI sidecar (which we compile) — we just
// download the pinned, checksum-verified binary and drop it next to the CLI
// sidecar as `binaries/pi-<triple>`. The desktop hands its path to the CLI as
// `--pi-bin` at runtime (see lib/pi-runtime.ts); the CLI spawns it for local
// conversations. Pin the version alongside the CLI/translator so the whole
// {pi, extensions, CLI} triple ships together (see connect-pi-d1-bundling).
//
// Two modes mirror build-sidecar.mjs:
//   • default   — the host triple only (fast; `tauri dev` / local build).
//   • universal — SIDECAR_UNIVERSAL=1 / `--universal`: both darwin arch
//     binaries + the lipo'd `-universal-apple-darwin` fat binary (our release).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Pin the pi release. Bump alongside the CLI/translator (the version triple).
const PI_VERSION = "0.80.3";
const PI_REPO = "badlogic/pi-mono";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const universal = process.argv.includes("--universal") || process.env.SIDECAR_UNIVERSAL === "1";

function fail(msg) {
  console.error(`build-pi-sidecar: ${msg}`);
  process.exit(1);
}

// Rust host triple (e.g. aarch64-apple-darwin) — Tauri resolves the sidecar by
// this suffix and strips it at runtime.
let hostTriple;
try {
  hostTriple = execFileSync("rustc", ["-vV"], { encoding: "utf8" }).match(/^host:\s*(.+)$/m)?.[1]?.trim();
} catch {
  fail("`rustc` not found — install the Rust toolchain (https://rustup.rs).");
}
if (!hostTriple) fail("could not determine Rust host triple from `rustc -vV`.");

// Rust triple → pi release asset. Only the arches our release ships (macOS).
const ASSET_FOR = {
  "aarch64-apple-darwin": "pi-darwin-arm64.tar.gz",
  "x86_64-apple-darwin": "pi-darwin-x64.tar.gz",
};

const outDir = join(root, "src-tauri", "binaries");
mkdirSync(outDir, { recursive: true });

// pi is NOT a self-contained binary: the bun executable resolves its package
// assets (themes it loads at startup, export-html templates, native `.node`
// deps, the photon wasm) from a package dir — `getPackageDir()`, overridable via
// `PI_PACKAGE_DIR`. externalBin ships the executable (for macOS signing); these
// assets ride as a resource and cli.ts points `PI_PACKAGE_DIR` at them. Without
// them the bundled pi crashes on startup (ENOENT theme/dark.json). We stage the
// runtime subset and skip docs/ + examples/ (~3.9M, not needed at runtime).
// NOTE (release): `native/` + `node_modules/` carry 2 Mach-O `.node` files
// (clipboard, keyboard-modifiers) that must be signed during notarization.
const assetsDir = join(root, "src-tauri", "resources", "pi-assets");
const PI_ASSET_ENTRIES = [
  "theme",
  "export-html",
  "native",
  "assets",
  "node_modules",
  "photon_rs_bg.wasm",
  "package.json",
];
mkdirSync(assetsDir, { recursive: true });

/** Copy pi's runtime package assets from the extracted `pi/` dir into the
 *  resource dir. Arch-independent, so staging from either arch's tarball is
 *  fine (idempotent overwrite). */
function stageAssets(pkgDir) {
  for (const entry of PI_ASSET_ENTRIES) {
    const from = join(pkgDir, entry);
    if (!existsSync(from)) continue;
    const dest = join(assetsDir, entry);
    rmSync(dest, { recursive: true, force: true });
    cpSync(from, dest, { recursive: true });
  }
}

/** True once the package assets are present (theme is the load-bearing one). */
function assetsStaged() {
  return existsSync(join(assetsDir, "theme", "dark.json"));
}

const base = `https://github.com/${PI_REPO}/releases/download/v${PI_VERSION}`;

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) fail(`download failed (${res.status}) — ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// One expected sha256 per asset, from the release's SHA256SUMS. Cached per run.
let sums = null;
async function expectedSha(asset) {
  if (!sums) {
    const text = (await download(`${base}/SHA256SUMS`)).toString("utf8");
    sums = Object.fromEntries(
      text
        .split("\n")
        .map((l) => l.trim().split(/\s+/))
        .filter((p) => p.length === 2)
        .map(([hash, name]) => [name.replace(/^\*/, ""), hash]),
    );
  }
  const want = sums[asset];
  if (!want) fail(`no SHA256 for ${asset} in the release SHA256SUMS`);
  return want;
}

// Download + verify + extract the `pi` executable to `binaries/pi-<triple>`.
async function stage(triple) {
  const out = join(outDir, `pi-${triple}`);
  // Skip only when BOTH the binary and its package assets are present — a cached
  // binary with missing assets would ship a pi that can't start.
  if (existsSync(out) && assetsStaged()) {
    console.log(`build-pi-sidecar: ${out} + assets present — skipping (delete to re-fetch).`);
    return out;
  }
  const asset = ASSET_FOR[triple];
  if (!asset) fail(`no pi release asset mapped for triple ${triple}`);

  console.log(`build-pi-sidecar: fetch ${asset} (pi v${PI_VERSION})`);
  const tarball = await download(`${base}/${asset}`);
  const got = createHash("sha256").update(tarball).digest("hex");
  const want = await expectedSha(asset);
  if (got !== want) fail(`checksum mismatch for ${asset}\n  expected ${want}\n  got      ${got}`);

  const work = mkdtempSync(join(tmpdir(), "pi-sidecar-"));
  try {
    const tar = join(work, asset);
    await writeFile(tar, tarball);
    execFileSync("tar", ["-xzf", tar, "-C", work], { stdio: "inherit" });
    const pi = findExecutable(work);
    if (!pi) fail(`no \`pi\` executable found in ${asset}`);
    execFileSync("install", ["-m", "0755", pi, out]); // copy + chmod +x
    stageAssets(dirname(pi)); // pi's package dir is the extracted `pi/` folder
    console.log(`build-pi-sidecar: staged ${out} + package assets`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return out;
}

// Find a file named `pi` in the extracted tree (the tarball may nest it).
function findExecutable(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findExecutable(p);
      if (found) return found;
    } else if (entry.name === "pi" && statSync(p).size > 0) {
      return p;
    }
  }
  return null;
}

if (!universal) {
  // Non-macOS host (the product ships macOS-only today): don't hard-fail the
  // whole `tauri dev`/`build` — skip bundling pi so the rest still builds. The
  // CLI sidecar is host-generic (bun compiles for any triple) and initPiRuntime
  // falls back to the user's PATH `pi`, so a dev on Linux/Windows loses only the
  // bundled binary, not a working app. Mirrors the "never blocks" philosophy.
  if (!ASSET_FOR[hostTriple]) {
    console.warn(
      `build-pi-sidecar: no prebuilt pi for ${hostTriple} — skipping (macOS-only today; falls back to PATH pi).`,
    );
    // Keep the resource dir present so tauri's build.rs check passes (it's in
    // bundle.resources); PI_PACKAGE_DIR stays unset in dev, PATH pi has its own.
    if (!assetsStaged()) writeFileSync(join(assetsDir, ".gitkeep"), "");
    process.exit(0);
  }
  await stage(hostTriple);
  console.log("build-pi-sidecar: done.");
} else {
  // Mirror build-sidecar's universal output: both per-arch sidecars (each arch
  // slice's cargo build resolves its own by triple) + the lipo'd fat binary
  // (the bundling stage copies that into the universal app). Tauri won't lipo
  // external binaries for us.
  const arm = await stage("aarch64-apple-darwin");
  const x64 = await stage("x86_64-apple-darwin");
  const fat = join(outDir, "pi-universal-apple-darwin");
  console.log(`build-pi-sidecar: lipo -> ${fat}`);
  try {
    execFileSync("lipo", ["-create", arm, x64, "-output", fat], { stdio: "inherit" });
  } catch {
    fail("`lipo` failed — universal builds need Xcode command-line tools (macOS only).");
  }
  console.log("build-pi-sidecar: done (universal — both arch sidecars + fat binary).");
}
