# is_desktop

Local-first desktop client for [IdeaSpaces](https://ideaspaces.xyz) — Obsidian's
on-disk editing fused with GitHub's browse-and-collaborate. Built with Tauri
(Rust core) + React / Vite / TypeScript.

v1 scope: **login, edit, sync.** Browse/graph/collaboration ride the hosted API;
a local agent is a later fast-follow.

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

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
