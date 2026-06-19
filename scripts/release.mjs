// Cut a release: bump the version in all three places, commit, and tag.
//
//   npm run release 0.2.0
//
// The version lives in three files that must stay in lockstep — package.json
// (frontend), src-tauri/tauri.conf.json (bundle/app version), and
// src-tauri/Cargo.toml (Rust crate). This bumps all three, commits, and creates
// an annotated `v<version>` tag. Pushing that tag (`git push --follow-tags`)
// triggers the release workflow, which builds and publishes the DMG.
//
// It does NOT push — you review the commit + tag first, then push deliberately.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function die(msg) {
  console.error(`release: ${msg}`);
  process.exit(1);
}

const version = process.argv[2];
if (!version) die("usage: npm run release <version>   e.g. npm run release 0.2.0");
if (!/^\d+\.\d+\.\d+$/.test(version)) die(`"${version}" is not a semver x.y.z`);

const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

// Refuse to bump on a dirty tree — the commit must be exactly the version bump.
if (git(["status", "--porcelain"])) die("working tree is dirty — commit or stash first.");

const tag = `v${version}`;
if (git(["tag", "--list", tag])) die(`tag ${tag} already exists.`);

// package.json — the "version": "x.y.z" line.
const pkgPath = join(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const from = pkg.version;
pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

// tauri.conf.json — the top-level "version" (parse + rewrite, so a future
// nested `version` field can't be hit by accident).
const confPath = join(root, "src-tauri", "tauri.conf.json");
const conf = JSON.parse(readFileSync(confPath, "utf8"));
conf.version = version;
writeFileSync(confPath, JSON.stringify(conf, null, 2) + "\n");

// Cargo.toml — the [package] version line (first `version = "…"` in the file).
const cargoPath = join(root, "src-tauri", "Cargo.toml");
const cargo = readFileSync(cargoPath, "utf8");
const cargoNext = cargo.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`);
if (cargoNext === cargo) die("could not find a version field in Cargo.toml");
writeFileSync(cargoPath, cargoNext);

// Refresh Cargo.lock's workspace-member version so the bump doesn't leave the
// lock stale (cargo would otherwise rewrite it on the next build, dirtying the
// tree). `--workspace` syncs the local package entries without touching
// external dependency ranges.
try {
  execFileSync("cargo", ["update", "--workspace"], {
    cwd: join(root, "src-tauri"),
    stdio: "ignore",
  });
} catch {
  console.warn("release: skipped Cargo.lock refresh (cargo not on PATH) — run a build before pushing.");
}

git(["add", "package.json", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock"]);
git(["commit", "-m", `Release ${tag}`]);
git(["tag", "-a", tag, "-m", `Release ${tag}`]);

console.log(`release: ${from} → ${version}`);
console.log(`release: committed and tagged ${tag}.`);
console.log("release: review, then:  git push --follow-tags");
