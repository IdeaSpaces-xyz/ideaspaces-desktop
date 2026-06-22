# Development

Built with **Tauri** (Rust core) + **React / Vite / TypeScript**. v1 scope:
**login, edit, sync, conversations.** Browse/graph collaboration rides the
hosted API; a local agent is a later fast-follow.

## Architecture

The desktop is a thin GUI over the bundled
[`@ideaspaces/cli`](https://github.com/IdeaSpaces-xyz/cli), which owns
authentication, git, clone, and sync. The CLI is compiled to a native **Tauri
sidecar** and invoked from the frontend via the shell plugin; the Rust core
stays thin (native concerns only — no auth/git logic).

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

A binary you built locally carries no quarantine flag and opens directly — the
Gatekeeper and file-access notes in the README's Download section apply only to
a `.dmg` you download or hand to another Mac. To clear the flag on such a build
without the right-click dance:

```bash
xattr -dr com.apple.quarantine /path/to/IdeaSpaces.app
```

v1 targets **macOS** first. `tauri build` also produces Linux/Windows bundles
under the same `bundle/` root (packaging steps differ) — but those platforms
aren't tested yet.

> **Updater signing on local builds.** The app ships an auto-updater, so
> `tauri build` produces signed updater artifacts (`bundle.createUpdaterArtifacts`)
> and **requires the updater signing key** — without it the build errors. CI has
> the key (the `TAURI_SIGNING_PRIVATE_KEY` secret); for a local release build,
> point at a throwaway key:
> ```bash
> npx tauri signer generate -w /tmp/dev-updater.key   # once
> export TAURI_SIGNING_PRIVATE_KEY="$(cat /tmp/dev-updater.key)"
> export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""         # whatever you set
> npm run tauri build
> ```
> `tauri dev` is unaffected — only the `build` bundling step signs.

### Other checks

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

Pushing the `v*` tag triggers [`.github/workflows/release.yml`](../.github/workflows/release.yml),
which on a macOS runner compiles the universal CLI sidecar (`SIDECAR_UNIVERSAL=1`
→ both arches, lipo'd), builds `--target universal-apple-darwin`, and publishes
a **draft** GitHub Release with the universal **`.dmg`** attached. Open the draft,
confirm the DMG launches, then click **Publish release**. Watch progress in the
repo's **Actions** tab (~15–25 min cold). The DMG-packaging step (`bundle_dmg.sh`)
flakes intermittently on headless runners, so the build auto-retries
(`retryAttempts`).

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

Once set, drop the "unsigned" notes from the README's **Download** section and
the release body.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
