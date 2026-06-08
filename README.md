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

## Development

```bash
npm install            # installs deps; @ideaspaces/cli builds its bundle on install
npm run tauri dev      # builds the sidecar, serves Vite, launches the app
```

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
