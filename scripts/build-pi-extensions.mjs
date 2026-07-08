// Vendor the two pi extensions into Tauri resources so a shipped app can run a
// local turn with no dev setup (Connect Pi D1b).
//
// Unlike the pi binary and the CLI (both compiled to native sidecars), the
// extensions ship as SOURCE: pi loads their TS through its jiti loader, and —
// after the pi→CLI convergence — they import nothing from `@ideaspaces/sdk` at
// runtime (they shell the bundled CLI via `IS_CLI_PATH`). So bundling is a copy,
// not a build: for each extension we take its `package.json` (carries the
// `pi.extensions` + `skills` manifest), `src/`, `skills/`, and — for pi-is-space
// — the committed `reference/` its skills cite. No `node_modules`: the peer deps
// (`@earendil-works/pi-coding-agent`, `typebox`) come from the pi runtime.
//
// Source is `node_modules/@ideaspaces/pi-*` (github devDependencies), mirroring
// how build-sidecar.mjs reads `@ideaspaces/cli` from node_modules — so CI
// reproduces it from `npm ci`, no reach into sibling `projects/` checkouts.
//
// See: src-tauri tauri.conf.json (bundle.resources), src/lib/cli.ts
// (initPiRuntime resolves the resource dirs + passes --ext/--skill), and
// roadmap connect-pi-d1-bundling (D1b).

import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "src-tauri", "resources", "pi-ext");

// Each extension: its package name (under node_modules) + the subdirs to carry.
// package.json is always copied (the `pi.extensions`/`skills` manifest).
const EXTENSIONS = [
  { pkg: "@ideaspaces/pi-is-space", name: "pi-is-space", dirs: ["src", "skills", "reference"] },
  { pkg: "@ideaspaces/pi-local-context", name: "pi-local-context", dirs: ["src", "skills"] },
];

let staged = 0;
for (const ext of EXTENSIONS) {
  const from = join(root, "node_modules", ext.pkg);
  if (!existsSync(from)) {
    // Dev without the devDependency installed: skip rather than hard-fail the
    // whole `tauri dev`/`build`. The dev loop supplies extensions via
    // IDEASPACES_PI_EXTENSIONS instead, and initPiRuntime falls back to it.
    console.warn(`build-pi-extensions: ${ext.pkg} not in node_modules — skipping (dev uses IDEASPACES_PI_EXTENSIONS).`);
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
  console.log(`build-pi-extensions: staged ${ext.name} (${ext.dirs.join(", ")})`);
  staged++;
}

console.log(`build-pi-extensions: done (${staged}/${EXTENSIONS.length} staged).`);
