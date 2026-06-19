# is_desktop

Local-first desktop client for [IdeaSpaces](https://ideaspaces.xyz) — Obsidian's
on-disk editing fused with GitHub's browse-and-collaborate. Built with Tauri
(Rust core) + React / Vite / TypeScript.

v1 scope: **login, edit, sync.** Browse/graph/collaboration ride the hosted API;
a local agent is a later fast-follow.

## Download

Grab the latest **`.dmg`** from [**Releases**](https://github.com/IdeaSpaces-xyz/is_desktop/releases),
open it, and drag **IdeaSpaces** to Applications. It's a universal build — runs
on both Apple Silicon and Intel Macs.

> **Unsigned build — first launch.** The DMG isn't yet code-signed, so macOS
> Gatekeeper blocks the first open (*"Apple cannot check it for malicious
> software"*). Either **right-click the app → Open** and confirm once, or:
> ```bash
> xattr -dr com.apple.quarantine /Applications/IdeaSpaces.app
> ```
> Signing + notarization (clean double-click) is a tracked follow-up.

## Architecture

The desktop is a thin GUI over the bundled [`@ideaspaces/cli`](https://github.com/IdeaSpaces-xyz/cli),
which owns authentication, git, clone, and sync. The CLI is compiled to a native
**Tauri sidecar** and invoked from the frontend via the shell plugin; the Rust
core stays thin (native concerns only — no auth/git logic).

```
frontend (React) → Command.sidecar("binaries/ideaspaces", […]) → bundled CLI → git / API
```

## Prerequisites

- **Node** ≥ 20
- **Rust** (stable) — https://rustup.rs
- **bun** ≥ 1.0 — https://bun.sh — used to compile the CLI into the sidecar
  binary (`bun build --compile`)
- Platform deps for Tauri v2 — https://tauri.app/start/prerequisites/

## Run it

Two ways, depending on whether you want to develop or just click-and-test.

### Develop (hot-reload window)

```bash
npm install            # installs deps; @ideaspaces/cli builds its bundle on install
npm run tauri dev      # builds the sidecar, serves Vite, launches the app window
```

First run compiles the Rust core (a few minutes); subsequent runs are fast and
hot-reload the frontend. This is the quickest way to try the app.

### Build a clickable app (.app / .dmg)

```bash
npm run tauri build    # sidecar + frontend + Rust release, then bundles the app
```

Output lands in `src-tauri/target/release/bundle/`:

- **`macos/IdeaSpaces.app`** — double-click to launch (or `open` it).
- **`dmg/IdeaSpaces_<version>_<arch>.dmg`** — drag-to-Applications installer.
  (`<arch>` is `aarch64` on Apple Silicon, `x86_64` on Intel.)

```bash
open src-tauri/target/release/bundle/macos/IdeaSpaces.app
```

v1 targets **macOS** first. `tauri build` also produces Linux/Windows bundles
under the same `bundle/` root (packaging steps differ; the Gatekeeper note below
is macOS-only) — but those platforms aren't tested yet.

> **Unsigned build — macOS Gatekeeper.** The app you just built runs directly
> (a locally-built binary carries no quarantine flag). But once the `.app`/`.dmg`
> is **downloaded or copied to another Mac**, Gatekeeper blocks the first launch
> with *"IdeaSpaces can't be opened because Apple cannot check it…"* — until we
> code-sign + notarize (a tracked follow-up). On that machine, either
> **right-click the app → Open** (confirm once), or clear the quarantine flag:
> ```bash
> xattr -dr com.apple.quarantine /path/to/IdeaSpaces.app
> ```
> Editing clones inside protected folders (Documents/Desktop/Downloads/Dropbox)
> also triggers a one-time macOS file-access prompt — expected, grant per folder.

Other checks:

```bash
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm run build          # frontend build (tsc && vite build)
npm run build:sidecar  # compile the CLI into src-tauri/binaries/ideaspaces-<triple>
```

Rust core:

```bash
cd src-tauri
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo build
```

CI runs the frontend checks and the Rust checks on every PR; a tailored SLC
(Simple, Lovable, Complete) review runs alongside.

## Releasing

Releases are **tag-driven**. Cutting one is two commands:

```bash
npm run release 0.2.0      # bumps package.json + tauri.conf.json + Cargo.toml,
                           # commits "Release v0.2.0", tags v0.2.0
git push --follow-tags     # pushes the commit + tag
```

Pushing the `v*` tag triggers [`.github/workflows/release.yml`](.github/workflows/release.yml),
which on a macOS runner compiles the universal CLI sidecar (`SIDECAR_UNIVERSAL=1`
→ aarch64 + x86_64 lipo'd together), builds `--target universal-apple-darwin`,
and publishes a GitHub Release with the universal **`.dmg`** attached. Watch it
in the repo's **Actions** tab; the release appears under **Releases** when green
(~15–25 min cold).

The version lives in three files kept in lockstep — `package.json`,
`src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` — which `npm run release`
bumps together (it refuses to run on a dirty tree, so the commit is exactly the
bump). Don't hand-edit one and forget the others.

### Turning on code signing (later)

The workflow already has the signing slots wired — it just ships unsigned until
the secrets exist. With an Apple Developer ID, add these repo secrets and the
next release signs + notarizes automatically (no workflow change):

| Secret | What |
|---|---|
| `APPLE_CERTIFICATE` | base64 of the Developer ID Application `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | the `.p12` export password |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Name (TEAMID)` |
| `APPLE_ID` / `APPLE_PASSWORD` | Apple ID + an app-specific password (notarization) |
| `APPLE_TEAM_ID` | your 10-char Apple Team ID |

Once set, drop the "unsigned" notes from the **Download** section and the release
body.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
