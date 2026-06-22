# IdeaSpaces Desktop

A local-first desktop app for [IdeaSpaces](https://ideaspaces.xyz). Your notes
live as plain Markdown on disk — edit them in anything — with one-click **sync**
to your IdeaSpace and built-in **conversations** with agents over your repos.

<!-- TODO: drop a screenshot/GIF of the app here — highest-value addition to
     this README. Save under docs/ and reference it. -->

## Download

1. Get the latest **`IdeaSpaces_<version>_universal.dmg`** from
   [**Releases**](https://github.com/IdeaSpaces-xyz/ideaspaces-desktop/releases/latest)
   — one universal build runs on both Apple Silicon and Intel Macs.
2. Open the `.dmg` and drag **IdeaSpaces** to your Applications folder.
3. Launch it, sign in, and point it at a folder to start editing and syncing.

> **Heads-up — early unsigned build (work in progress).** It isn't yet
> signed/notarized by Apple, so macOS Gatekeeper blocks the first launch —
> *"Apple cannot check it…"* or *"IdeaSpaces is damaged and can't be opened"*.
> That's expected and safe; Apple notarization is on the way. To open it now,
> use **one** of these:
>
> - **Terminal — most reliable** (recent macOS removed the right-click bypass).
>   After dragging to Applications:
>   ```bash
>   xattr -dr com.apple.quarantine /Applications/IdeaSpaces.app
>   ```
>   then double-click as usual.
> - **System Settings** — try to open once, then **Settings → Privacy &
>   Security** → scroll down → **Open Anyway**.
> - **Older macOS** — **right-click the app → Open** → confirm once.
>
> Editing notes inside protected folders (Documents / Desktop / Downloads /
> Dropbox) also prompts for file access once — grant per folder.

---

Building from source or cutting a release? See
[**docs/DEVELOPMENT.md**](docs/DEVELOPMENT.md).
