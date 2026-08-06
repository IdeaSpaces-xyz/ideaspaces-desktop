// Vendor the two pi extensions into Tauri resources so a shipped app can run a
// local turn with no dev setup (Connect Pi D1b).
//
// Unlike the pi binary and the CLI (both compiled to native sidecars), the
// extensions ship as SOURCE: pi loads their TS through its jiti loader, and —
// after the pi→CLI convergence — they import nothing from `@ideaspaces/sdk` at
// runtime (they shell the bundled CLI via `IS_CLI_PATH`). So bundling is a copy,
// not a build: for each extension we take its `package.json` (carries the
// `pi.extensions` + `skills` manifest), `src/`, `skills/`, and — for pi-is-space
// — the committed `reference/` its skills cite. Peer deps
// (`@earendil-works/pi-coding-agent`, `typebox`) come from the pi runtime, but a
// non-peer runtime dep (pi-is-space imports `@ideaspaces/protocol`) is vendored
// into the extension's `node_modules` (see `deps` below) so jiti can resolve it.
//
// Source is `node_modules/@ideaspaces/pi-*` (github devDependencies), mirroring
// how build-sidecar.mjs reads `@ideaspaces/cli` from node_modules — so CI
// reproduces it from `npm ci`, no reach into sibling `projects/` checkouts.
//
// See: src-tauri tauri.conf.json (bundle.resources), src/lib/cli.ts
// (initPiRuntime resolves the resource dirs + passes --ext/--skill), and
// roadmap connect-pi-d1-bundling (D1b).

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "src-tauri", "resources", "pi-ext");

// In CI/release, `npm ci` always installs the devDependencies, so a missing
// extension is a broken pipeline — fail loudly here rather than leaning on
// Tauri's downstream "resource path doesn't exist" to catch it. Locally a dev
// may not have them; there we warn and fall back to IDEASPACES_PI_EXTENSIONS.
const isCI = !!process.env.CI;

// Each extension: its package name (under node_modules), the subdirs to carry,
// and any RUNTIME deps to vendor into its node_modules. package.json is always
// copied (the `pi.extensions`/`skills` manifest).
//
// `deps` are the packages the extension imports at runtime that the pi runtime
// does NOT provide (unlike the `@earendil-works/pi-coding-agent` / `typebox`
// peers). pi-is-space now assembles awareness in-process from
// `@ideaspaces/protocol`, so that (and its own dep `yaml`) must sit in the
// extension's node_modules for pi's jiti loader to resolve them.
const EXTENSIONS = [
  {
    pkg: "@ideaspaces/pi-is-space",
    name: "pi-is-space",
    dirs: ["src", "skills", "reference"],
    deps: ["@ideaspaces/protocol", "yaml"],
  },
  { pkg: "@ideaspaces/pi-local-context", name: "pi-local-context", dirs: ["src", "skills"], deps: [] },
];

// The dir must always exist: `tauri.conf.json` lists `resources/pi-ext` in
// bundle.resources, and Tauri's build.rs fails the whole Rust build with an
// opaque "resource path doesn't exist" if it's missing. So a dev who pulled
// main but hasn't `npm install`ed the extension devDependencies still gets a
// working `tauri dev` (empty dir → the local-turn fallback is
// IDEASPACES_PI_EXTENSIONS), not a cryptic compile error.
mkdirSync(outDir, { recursive: true });

let staged = 0;
for (const ext of EXTENSIONS) {
  const from = join(root, "node_modules", ext.pkg);
  if (!existsSync(from)) {
    const msg = `${ext.pkg} not in node_modules`;
    if (isCI) {
      // A release/CI build must bundle the extensions — don't ship a broken app.
      console.error(`build-pi-extensions: ${msg} — run \`npm ci\` (required for a packaged build).`);
      process.exit(1);
    }
    // Dev without the devDependency installed: skip rather than hard-fail the
    // whole `tauri dev`/`build`. The dev loop supplies extensions via
    // IDEASPACES_PI_EXTENSIONS instead, and initPiRuntime falls back to it.
    console.warn(`build-pi-extensions: ${msg} — run \`npm install\` to bundle it; skipping (dev uses IDEASPACES_PI_EXTENSIONS).`);
    continue;
  }
  const dest = join(outDir, ext.name);
  rmSync(dest, { recursive: true, force: true }); // reproducible: start clean
  mkdirSync(dest, { recursive: true });
  cpSync(join(from, "package.json"), join(dest, "package.json"));
  for (const dir of ext.dirs) {
    const dirFrom = join(from, dir);
    if (existsSync(dirFrom)) cpSync(dirFrom, join(dest, dir), { recursive: true });
  }
  // Vendor runtime deps into the extension's node_modules so jiti resolves them
  // (walks up from src/ → pi-is-space/node_modules). Pulled from the app's
  // node_modules (npm-hoisted), mirroring how the extension source itself is read.
  // NOTE: the extension packages are devDependencies, so these land dev-only in
  // the lockfile. This step runs after a plain `npm ci` (dev deps present) — do
  // NOT add `--omit=dev`/`NODE_ENV=production` before the Tauri build, or the
  // extension would ship without its runtime dep (fails loudly in CI, degrades to
  // warn-and-skip locally).
  for (const dep of ext.deps ?? []) {
    const depFrom = join(root, "node_modules", dep);
    if (!existsSync(depFrom)) {
      const msg = `${ext.pkg} runtime dep ${dep} not in node_modules`;
      if (isCI) {
        console.error(`build-pi-extensions: ${msg} — run \`npm ci\`.`);
        process.exit(1);
      }
      console.warn(`build-pi-extensions: ${msg} — run \`npm install\`; skipping.`);
      continue;
    }
    cpSync(depFrom, join(dest, "node_modules", dep), { recursive: true });
  }
  console.log(
    `build-pi-extensions: staged ${ext.name} (${ext.dirs.join(", ")}${ext.deps?.length ? `; deps: ${ext.deps.join(", ")}` : ""})`,
  );
  staged++;
}

// Keep the resource dir non-empty even when nothing staged, so the tauri
// build.rs existence check passes (an empty tracked-less dir can be pruned).
if (staged === 0) writeFileSync(join(outDir, ".gitkeep"), "");

console.log(`build-pi-extensions: done (${staged}/${EXTENSIONS.length} staged).`);
