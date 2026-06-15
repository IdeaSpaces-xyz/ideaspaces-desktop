import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  FilePlus,
  FileText,
  Folder,
  FolderPlus,
  PanelLeft,
  PanelLeftClose,
  Plus,
  RefreshCw,
  UploadCloud,
  X,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { WikiLinkResolvedTarget } from "@atomic-editor/editor";
import { NoteEditor } from "../editor/NoteEditor";
import { useDir } from "../editor/useDir";
import { useRecentNotes } from "../editor/useRecentNotes";
import { useWikiIndex } from "../editor/useWikiIndex";
import { classifyLink } from "../editor/linkResolve";
import { parseFrontmatter, setFrontmatterName } from "../editor/frontmatter";
import {
  createFolder,
  createNote,
  createUntitledNote,
  readNote,
  renameNote,
  writeNote,
  type FolderEntry,
  type NoteFile,
  type RecentNote,
} from "../lib/notes";
import { bucketByTime, relativeTime } from "../lib/time";
import { ask } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { cloneStatus, commitClone, syncClone, type CloneRecord } from "../lib/cli";
import { useToast } from "../toast/toast-context";
import { Resizer } from "./Resizer";
import { CopyButton } from "./CopyButton";
import { cn } from "../lib/cn";

// Ghost toolbar button — no border/fill, just text that lifts on hover. Keeps
// the open note feeling like a document, not a form.
const barBtn =
  "inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-is-text-tertiary transition hover:bg-is-surface-alt hover:text-is-text disabled:cursor-not-allowed disabled:opacity-50";

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// README renders as plain prose — drop the leading YAML so the folder guide
// reads as content, not a Properties panel.
function stripFrontmatter(content: string): string {
  const fm = parseFrontmatter(content);
  if (!fm) return content;
  return content.split("\n").slice(fm.endLine).join("\n").replace(/^\n+/, "");
}

type SyncState = "loading" | "synced" | "unsynced" | "syncing";

// One opened note: loads its content, autosaves edits to disk (debounced), and
// syncs (commit + push, commit hidden) via the CLI. No Save button — it's 2026.
// Keyed by path so each note gets fresh state (NoteEditor mounts per note).
function NotePane({
  note,
  clone,
  onBusyChange,
  onClose,
  onLink,
  onRetitle,
  autoFocusTitle,
  resolveWiki,
}: {
  note: NoteFile;
  clone: CloneRecord;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
  // Open a link/wiki-target, resolved relative to the note it was clicked in.
  onLink: (target: string, fromRelPath: string) => void;
  // Retitle: write `content` (with the new frontmatter name) and reselect.
  onRetitle: (content: string, title: string) => Promise<void> | void;
  // Freshly created note — focus the title field rather than the body.
  autoFocusTitle: boolean;
  resolveWiki: (target: string) => WikiLinkResolvedTarget | null;
}) {
  const toast = useToast();
  const [content, setContent] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const draftRef = useRef("");
  // The last text written to disk — what autosave diffs against.
  const savedRef = useRef("");
  const saveTimer = useRef<number | null>(null);
  const [saving, setSaving] = useState(false);
  // Sync = whether local edits have reached the remote. Starts "loading" (the
  // pill renders nothing) until seeded from git on open — the clone may already
  // carry unsynced work; an edit flips it to "unsynced".
  const [syncState, setSyncState] = useState<SyncState>("loading");
  // An operation (retitle or sync) is in flight — blocks navigation + inputs.
  const [busy, setBusy] = useState(false);

  // Title (= frontmatter `name`, = the filename slug). README is structural, so
  // it's shown read-only.
  const isReadme = /^readme$/i.test(note.name);
  const [titleDraft, setTitleDraft] = useState(note.title ?? "");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocusTitle && content !== null) titleRef.current?.focus();
  }, [autoFocusTitle, content]);

  const commitTitle = useCallback(async () => {
    const trimmed = titleDraft.trim();
    if (busy || !trimmed || trimmed === (note.title ?? "")) {
      setTitleDraft(note.title ?? ""); // revert empty / unchanged
      return;
    }
    setBusy(true);
    try {
      await onRetitle(setFrontmatterName(draftRef.current, trimmed), trimmed);
    } catch (err) {
      toast(errMessage(err), "error");
      setTitleDraft(note.title ?? ""); // revert — the title wasn't saved
      setBusy(false); // on success the pane remounts at the new path
    }
  }, [titleDraft, busy, note.title, onRetitle, toast]);

  // Report sync-in-flight up so the surface blocks navigation mid-sync/retitle.
  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  useEffect(() => {
    let alive = true;
    readNote(note.path)
      .then((text) => {
        if (!alive) return;
        draftRef.current = text;
        savedRef.current = text;
        setContent(text);
      })
      .catch((err) => alive && setLoadError(errMessage(err)));
    return () => {
      alive = false;
    };
  }, [note.path]);

  // Seed the sync indicator from the clone's git state — it may carry prior
  // unsynced work (uncommitted, or committed-not-pushed) from before this open.
  useEffect(() => {
    let alive = true;
    cloneStatus(clone.path)
      .then((s) => {
        if (!alive) return;
        const seeded: SyncState = (s.ahead ?? 0) > 0 || s.dirty ? "unsynced" : "synced";
        // Only resolve the initial "loading" — never clobber a state the user
        // already drove (e.g. typed while the status call was in flight).
        setSyncState((cur) => (cur === "loading" ? seeded : cur));
      })
      .catch(() => {
        // Status unavailable — err toward showing Sync rather than hiding it, so
        // genuinely unsynced work is never silently masked as "synced".
        if (alive) setSyncState((cur) => (cur === "loading" ? "unsynced" : cur));
      });
    return () => {
      alive = false;
    };
  }, [clone.path]);

  // Write the draft to disk if it changed. The silent half of the loop — the
  // user never asks for it.
  const flushSave = useCallback(async () => {
    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (draftRef.current === savedRef.current) return;
    setSaving(true);
    try {
      await writeNote(note.path, draftRef.current);
      savedRef.current = draftRef.current;
    } catch (err) {
      toast(errMessage(err), "error");
    } finally {
      setSaving(false);
    }
  }, [note.path, toast]);

  // Debounced autosave — settle ~800ms after the last keystroke.
  const scheduleSave = useCallback(() => {
    if (saveTimer.current !== null) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void flushSave(), 800);
  }, [flushSave]);

  // Flush any pending edit when the note unmounts (switch note / close), so the
  // debounce timer never strands the last keystrokes. flushSave toasts its own
  // write errors; the extra catch logs anything unexpected on the way out so an
  // unmount-time failure isn't swallowed.
  useEffect(
    () => () => {
      flushSave().catch((err) => console.error("autosave on unmount failed", err));
    },
    [flushSave],
  );

  // Sync = make local and remote match. Commit (auto-message) is plumbing; the
  // user only sees "Sync". Flushes the latest edit first, then commit + push.
  const sync = useCallback(async () => {
    setBusy(true);
    setSyncState("syncing");
    try {
      await flushSave();
      // The content this sync publishes. If the user keeps typing mid-sync, the
      // draft moves past this, so we must not claim "synced" for the new edits.
      const syncedContent = draftRef.current;
      try {
        // Scoped commit: only this note's path, never other staged work.
        await commitClone(clone.path, `Edit ${note.relPath}`, [note.relPath]);
      } catch (err) {
        // Nothing new to commit is fine — fall through and push any committed
        // history. TODO(i18n): this matches the English "nothing to commit"
        // text; a machine-readable signal from the CLI `commit` verb would be
        // locale-robust. Tracked in roadmap/plans/desktop/_agent/now.md.
        if (!/nothing to commit|no changes/i.test(errMessage(err))) throw err;
      }
      const res = await syncClone(clone.path);
      // Edits that landed during the sync leave the note unsynced again.
      setSyncState(draftRef.current === syncedContent ? "synced" : "unsynced");
      toast(
        res.pushed
          ? `Synced — pushed ${res.pushed} change${res.pushed === 1 ? "" : "s"}`
          : "Synced — up to date",
      );
    } catch (err) {
      toast(errMessage(err), "error");
      setSyncState("unsynced");
    } finally {
      setBusy(false);
    }
  }, [clone.path, note.relPath, flushSave, toast]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-is-surface">
      <div className="flex items-center justify-between gap-3 px-5 py-2.5">
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-is-text-tertiary">
          <span className="truncate">{note.relPath}</span>
          {saving && <span className="shrink-0">· saving…</span>}
          <CopyButton value={note.relPath} label="note path" />
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {syncState === "syncing" ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs text-is-text-tertiary">
              <RefreshCw size={14} strokeWidth={1.333} className="animate-spin" aria-hidden="true" />
              Syncing…
            </span>
          ) : syncState === "unsynced" ? (
            <button type="button" className={barBtn} disabled={busy} onClick={() => void sync()}>
              <UploadCloud size={14} strokeWidth={1.333} aria-hidden="true" />
              Sync
            </button>
          ) : syncState === "synced" ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs text-is-text-tertiary">
              <Check size={14} strokeWidth={1.5} aria-hidden="true" />
              Synced
            </span>
          ) : null /* loading — render nothing until git status resolves */}
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close note"
            className="rounded-md p-1.5 text-is-text-tertiary transition hover:bg-is-surface-alt hover:text-is-text disabled:opacity-50"
          >
            <X size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      </div>
      {loadError ? (
        <p className="p-6 text-sm text-is-danger-text">{loadError}</p>
      ) : content === null ? (
        <p className="p-6 text-sm text-is-text-tertiary">Loading note…</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="px-6 pt-5">
            <div className="mx-auto max-w-[640px]">
              {isReadme ? (
                <h1 className="font-prose text-3xl text-is-text">{note.title || note.name}</h1>
              ) : (
                <input
                  ref={titleRef}
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      titleRef.current?.blur(); // commit, then focus moves to body
                    } else if (e.key === "Escape") {
                      setTitleDraft(note.title ?? "");
                      titleRef.current?.blur();
                    }
                  }}
                  onBlur={() => void commitTitle()}
                  placeholder="Untitled"
                  aria-label="Note title"
                  disabled={busy}
                  className="w-full bg-transparent font-prose text-3xl text-is-text outline-none placeholder:text-is-text-tertiary disabled:opacity-60"
                />
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 px-6">
            <NoteEditor
              initialContent={content}
              autoFocus={!autoFocusTitle}
              onChange={(doc) => {
                draftRef.current = doc;
                if (doc !== savedRef.current) {
                  // An edit means local is ahead of remote until the next Sync.
                  setSyncState((s) => (s === "syncing" ? s : "unsynced"));
                  scheduleSave();
                }
              }}
              onSave={() => void flushSave()}
              onLinkClick={(url) => onLink(url, note.relPath)}
              onWikiOpen={(t) => onLink(t, note.relPath)}
              resolveWiki={resolveWiki}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Breadcrumb across the current folder path; each segment navigates up.
function Breadcrumb({
  slug,
  segments,
  onNavigate,
}: {
  slug: string;
  segments: string[];
  onNavigate: (path: string) => void;
}) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-is-text-tertiary"
    >
      <button
        type="button"
        onClick={() => onNavigate("")}
        className={cn(
          "max-w-[12rem] truncate font-medium transition hover:text-is-text",
          segments.length === 0 && "text-is-text",
        )}
      >
        {slug}
      </button>
      {segments.map((seg, i) => {
        const cumulative = segments.slice(0, i + 1).join("/");
        const isLast = i === segments.length - 1;
        return (
          <Fragment key={cumulative}>
            <ChevronRight size={12} strokeWidth={1.5} className="shrink-0 opacity-60" aria-hidden="true" />
            {isLast ? (
              <span aria-current="page" className="truncate text-is-text">
                {seg}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(cumulative)}
                className="max-w-[10rem] truncate transition hover:text-is-text"
              >
                {seg}
              </button>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <h2 className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-is-text-tertiary">
      {children}
    </h2>
  );
}

function FolderList({ folders, onOpen }: { folders: FolderEntry[]; onOpen: (f: FolderEntry) => void }) {
  return (
    <div>
      <SectionLabel>Folders</SectionLabel>
      <ul className="flex flex-col gap-0.5">
        {folders.map((dir) => (
          <li key={dir.relPath}>
            <button
              type="button"
              onClick={() => onOpen(dir)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-is-text transition hover:bg-is-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
            >
              <Folder size={15} strokeWidth={1.333} className="shrink-0 text-is-text-tertiary" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{dir.name}</span>
              {dir.fileCount > 0 && (
                <span className="shrink-0 text-[11px] text-is-text-tertiary">{dir.fileCount}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Notes at one level. `compact` is the slim Focus-mode rail: tighter rows,
// single-line, no summary/copy — just quick switching between sibling notes.
function NoteList({
  files,
  selectedRel,
  onSelect,
  disabled,
  compact = false,
}: {
  files: NoteFile[];
  selectedRel: string | undefined;
  onSelect: (note: NoteFile) => void;
  disabled: boolean;
  compact?: boolean;
}) {
  return (
    <div>
      {!compact && <SectionLabel>Notes</SectionLabel>}
      <ul className={cn("flex flex-col", compact ? "gap-0.5" : "gap-1.5")}>
        {files.map((note) => {
          const active = selectedRel === note.relPath;
          return (
            <li
              key={note.relPath}
              className={cn(
                "group flex items-center rounded-lg border transition",
                compact ? "gap-0" : "gap-1 pr-2",
                active
                  ? "border-is-border bg-is-surface-alt"
                  : "border-transparent hover:border-is-border hover:bg-is-surface-alt",
              )}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(note)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex min-w-0 flex-1 items-center rounded-l-lg text-left transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring",
                  compact ? "gap-2 rounded-lg px-2.5 py-1.5" : "gap-3 px-3.5 py-3",
                )}
                title={note.summary ? `${note.relPath} — ${note.summary}` : note.relPath}
              >
                <FileText
                  size={compact ? 14 : 16}
                  strokeWidth={1.333}
                  className="shrink-0 text-is-text-tertiary"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-is-text", compact ? "text-sm" : "text-[15px]")}>
                    {note.title || note.name}
                  </span>
                  {!compact && note.summary && (
                    <span className="mt-0.5 block truncate text-xs text-is-text-tertiary">{note.summary}</span>
                  )}
                </span>
              </button>
              {!compact && (
                <CopyButton
                  value={note.relPath}
                  label="note path"
                  className="opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// The folder's README at the top as a folded teaser — borderless prose (no
// card, no frontmatter), clamped with a fade, and a "Read more" that opens the
// full note in the right editor pane. Keyed by path so navigating folders
// remounts with the new README.
function ReadmeCard({
  note,
  onOpen,
  onLink,
  resolveWiki,
}: {
  note: NoteFile;
  onOpen: () => void;
  onLink: (target: string, fromRelPath: string) => void;
  resolveWiki: (target: string) => WikiLinkResolvedTarget | null;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  // Whether the rendered README exceeds the clamp — drives the fade and the
  // "Read more" vs "Open" label, so a short README isn't a false teaser.
  const [overflowing, setOverflowing] = useState(false);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setError(undefined);
    readNote(note.path)
      .then((text) => alive && setContent(text))
      .catch((err) => alive && setError(errMessage(err)));
    return () => {
      alive = false;
    };
  }, [note.path]);

  // The live-preview mounts/grows asynchronously, so observe the rendered height
  // rather than measuring once. 176px = the max-h-44 clamp below.
  useEffect(() => {
    const el = innerRef.current;
    if (content === null || !el) return;
    const check = () => setOverflowing(el.scrollHeight > 176 + 8);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [content]);

  if (error) return <p className="mb-8 text-sm text-is-danger-text">{error}</p>;
  if (content === null) return <p className="mb-8 text-sm text-is-text-tertiary">Loading…</p>;

  return (
    <div className="mb-8">
      {/* Clamped teaser; the fade only shows when there's more below. */}
      <div className="relative max-h-44 overflow-hidden">
        <div ref={innerRef}>
          <NoteEditor
            initialContent={stripFrontmatter(content)}
            readOnly
            autoHeight
            autoFocus={false}
            onChange={() => {}}
            onSave={() => {}}
            onLinkClick={(url) => onLink(url, note.relPath)}
            onWikiOpen={(t) => onLink(t, note.relPath)}
            resolveWiki={resolveWiki}
          />
        </div>
        {overflowing && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-is-bg to-transparent" />
        )}
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="mt-1 inline-flex items-center gap-1 rounded-md text-xs text-is-accent-text transition hover:text-is-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
      >
        {overflowing ? "Read more" : "Open in editor"}
        <ArrowRight size={13} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  );
}

// "Add" menu in the browser bar — create a note or folder in the current path.
function AddMenu({
  onNewNote,
  onNewFolder,
  disabled,
}: {
  onNewNote: () => void;
  onNewFolder: () => void;
  disabled: boolean;
}) {
  const item =
    "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-is-text-secondary outline-none data-[highlighted]:bg-is-surface-alt data-[highlighted]:text-is-text";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="Add a note or folder"
          title="Add…"
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-is-border bg-is-surface px-2 py-1.5 text-xs text-is-text-secondary transition hover:border-is-accent hover:text-is-text disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
          Add
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-[10rem] rounded-lg border border-is-border bg-is-surface p-1 shadow-md"
        >
          <DropdownMenu.Item className={item} onSelect={onNewNote}>
            <FilePlus size={15} strokeWidth={1.333} className="text-is-text-tertiary" aria-hidden="true" />
            New note
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={onNewFolder}>
            <FolderPlus size={15} strokeWidth={1.333} className="text-is-text-tertiary" aria-hidden="true" />
            New folder
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// Inline name input for creating a folder in the current path. (Notes are
// created blank and titled in the editor — see createNewNote.)
function CreateRow({ onSubmit, onCancel }: { onSubmit: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSubmit(name);
      }}
      className="mb-4 flex items-center gap-2"
    >
      <FolderPlus size={16} strokeWidth={1.333} className="shrink-0 text-is-text-tertiary" aria-hidden="true" />
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        placeholder="New folder name"
        aria-label="New folder name"
        className="min-w-0 flex-1 rounded-md border border-is-border bg-is-bg px-2.5 py-1.5 text-sm text-is-text outline-none focus-visible:border-is-accent"
      />
      <button
        type="submit"
        disabled={!name.trim()}
        className="rounded-md bg-is-text px-3 py-1.5 text-xs font-medium text-is-bg transition hover:opacity-90 disabled:opacity-50"
      >
        Create
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md px-2 py-1.5 text-xs text-is-text-tertiary transition hover:text-is-text"
      >
        Cancel
      </button>
    </form>
  );
}

// The Recent timeline — every note in the clone, grouped by last-saved time
// (Today / Yesterday / This week / …, is_web v2 parity) newest first. The
// cross-folder "what changed when" feed; a row opens the note in the editor.
function RecentTimeline({
  notes,
  status,
  error,
  disabled,
  onSelect,
  onReload,
}: {
  notes: RecentNote[];
  status: "idle" | "loading" | "loaded" | "error";
  error?: string;
  disabled: boolean;
  onSelect: (note: RecentNote) => void;
  onReload: () => void;
}) {
  const buckets = useMemo(() => bucketByTime(notes, (n) => n.updatedAt), [notes]);

  if (status === "idle" || status === "loading") {
    return <p className="text-sm text-is-text-tertiary">Loading…</p>;
  }
  if (status === "error") {
    return (
      <p className="text-sm text-is-danger-text">
        {error}{" "}
        <button
          type="button"
          className="underline underline-offset-2 hover:text-is-text"
          onClick={onReload}
        >
          Retry
        </button>
      </p>
    );
  }
  if (notes.length === 0) {
    return <p className="text-sm text-is-text-tertiary">No notes in this space yet.</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      {buckets.map((bucket) => (
        <section key={bucket.key}>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-is-text-tertiary">
            {bucket.label}
          </p>
          <ul className="flex flex-col gap-1.5">
            {bucket.items.map((note) => {
              const slash = note.relPath.lastIndexOf("/");
              const dir = slash === -1 ? "" : note.relPath.slice(0, slash);
              return (
                <li key={note.relPath}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onSelect(note)}
                    className="flex w-full items-center gap-3 rounded-lg border border-transparent px-3.5 py-2.5 text-left transition hover:border-is-border hover:bg-is-surface-alt disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
                  >
                    <FileText
                      size={16}
                      strokeWidth={1.333}
                      className="shrink-0 text-is-text-tertiary"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] text-is-text">
                        {note.title || note.name}
                      </span>
                      {dir && (
                        <span className="mt-0.5 block truncate text-xs text-is-text-tertiary">{dir}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-is-text-tertiary">
                      {relativeTime(note.updatedAt)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

// The folder's notes on the landing (no note open), newest-edited first — a
// quick "what's here, what changed" overview beside the README. Rows carry the
// title, summary, and last-saved time; clicking opens the note.
function FolderNotes({
  notes,
  disabled,
  onSelect,
}: {
  notes: NoteFile[];
  disabled: boolean;
  onSelect: (note: NoteFile) => void;
}) {
  return (
    <ul className="flex flex-col gap-1.5">
      {notes.map((note) => (
        <li key={note.relPath}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelect(note)}
            className="flex w-full items-center gap-3 rounded-lg border border-transparent px-3.5 py-3 text-left transition hover:border-is-border hover:bg-is-surface-alt disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
          >
            <FileText
              size={16}
              strokeWidth={1.333}
              className="shrink-0 text-is-text-tertiary"
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] text-is-text">{note.title || note.name}</span>
              {note.summary && (
                <span className="mt-0.5 block truncate text-xs text-is-text-tertiary">{note.summary}</span>
              )}
            </span>
            {note.updatedAt ? (
              <span className="shrink-0 text-xs text-is-text-tertiary">{relativeTime(note.updatedAt)}</span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

// The editor surface for one local clone: a folder-drill-in tree on the left
// (breadcrumb + Folders + Notes), and the selected note open in a resizable
// live-preview editor pane on the right. Mirrors is_web v2's repo browser, with
// the desktop twist that the right pane *is* the editor (no read-only → edit
// toggle — the live-preview surface is editable in place).
export function EditorSurface({ clone, onClose }: { clone: CloneRecord; onClose: () => void }) {
  const toast = useToast();
  const [path, setPath] = useState("");
  const [selected, setSelected] = useState<NoteFile | undefined>(undefined);
  // Width of the persistent file rail (folders + notes); content takes the rest.
  const [railWidth, setRailWidth] = useState(256);
  // The file rail folds away for full-width content (Obsidian-style).
  const [railCollapsed, setRailCollapsed] = useState(false);
  // Bumped on retitle to force the editor to remount even when the path is
  // unchanged (a title edit that slugs to the same filename).
  const [editorKey, setEditorKey] = useState(0);
  // The just-created note's path — its pane focuses the title field instead of
  // the body (a precise signal, vs. guessing from an "untitled" filename).
  const [newNotePath, setNewNotePath] = useState<string | undefined>(undefined);
  // The open note is mid-sync/retitle — the only thing that blocks navigation
  // now that autosave persists edits continuously (no "discard unsaved" prompt).
  const [busy, setBusy] = useState(false);
  // Only folders use the inline create row now; new notes open blank + titled.
  const [creating, setCreating] = useState<"folder" | null>(null);
  // Browse the folder tree, or the Recent timeline (all notes by last-saved).
  const [browseMode, setBrowseMode] = useState<"tree" | "recent">("tree");
  const containerRef = useRef<HTMLDivElement>(null);
  const { status, folders, files, error, reload } = useDir(clone.path, path);
  const { index: wikiIndex, reload: reloadWiki } = useWikiIndex(clone.path);
  // Loaded lazily — only while Recent is the active browse view and no note is open.
  const recent = useRecentNotes(clone.path, !selected && browseMode === "recent");

  // Guard navigation: never leave mid-sync/retitle. There's no unsaved-edits
  // prompt anymore — autosave has already persisted the draft to disk.
  const confirmLeave = useCallback(async (): Promise<boolean> => !busy, [busy]);

  const navigate = useCallback(
    async (nextPath: string) => {
      if (nextPath === path && !selected) return; // already here, nothing open
      // Always guard — a no-op `||` short-circuit here would silently discard an
      // open dirty note (e.g. clicking the root crumb while already at root).
      if (await confirmLeave()) {
        setSelected(undefined); // the open note belongs to the level you left
        setCreating(null); // a pending "new note/folder" belongs to that level too
        setPath(nextPath);
      }
    },
    [path, selected, confirmLeave],
  );

  const selectNote = useCallback(
    async (note: NoteFile) => {
      if (note.relPath === selected?.relPath || (await confirmLeave())) setSelected(note);
    },
    [selected?.relPath, confirmLeave],
  );

  const closeNote = useCallback(async () => {
    if (await confirmLeave()) setSelected(undefined);
  }, [confirmLeave]);

  const submitCreate = useCallback(
    async (name: string) => {
      try {
        await createFolder(clone.path, path, name);
        await reload();
        setCreating(null);
      } catch (err) {
        toast(errMessage(err), "error");
      }
    },
    [clone.path, path, reload, toast],
  );

  // Add+ → New folder uses the inline create row in the browse tree, so close
  // any open note first (returns to Browse), guarded.
  const startCreateFolder = useCallback(async () => {
    if (selected && !(await confirmLeave())) return;
    setSelected(undefined);
    setRailCollapsed(false); // the inline name input lives in the rail
    setCreating("folder");
  }, [selected, confirmLeave]);

  // Add+ → New note: create a blank "Untitled" note and open it in Focus,
  // Obsidian-style — the title field focuses so you type the title (= filename).
  const createNewNote = useCallback(async () => {
    if (selected && !(await confirmLeave())) return;
    try {
      const note = await createUntitledNote(clone.path, path);
      await Promise.all([reload(), reloadWiki()]);
      setCreating(null);
      setNewNotePath(note.path);
      setSelected(note);
    } catch (err) {
      toast(errMessage(err), "error");
    }
  }, [selected, confirmLeave, clone.path, path, reload, reloadWiki, toast]);

  // Retitle the open note: write its content (new frontmatter `name`) to a
  // slugified filename, then reselect. The editorKey bump forces a remount even
  // when the slug is unchanged, so the editor reloads the updated frontmatter.
  const retitleNote = useCallback(
    async (content: string, title: string) => {
      if (!selected) return;
      const newNote = await renameNote(clone.path, selected.relPath, title, content);
      await Promise.all([reload(), reloadWiki()]);
      setNewNotePath(undefined); // titled now → its pane should focus the body
      setSelected(newNote);
      setEditorKey((k) => k + 1);
    },
    [selected, clone.path, reload, reloadWiki],
  );

  // `[[wiki-link]]` styling: resolved (points at a note) vs. missing.
  const resolveWiki = useCallback(
    (target: string): WikiLinkResolvedTarget | null => {
      const note = wikiIndex.resolve(target);
      return note
        ? { target, label: note.name, status: "resolved" }
        : { target, label: target, status: "missing" };
    },
    [wikiIndex],
  );

  // Open a note for a resolved link/wiki target: navigate to its folder + select.
  const openNote = useCallback(
    async (note: NoteFile) => {
      if (!(await confirmLeave())) return;
      const dir = note.relPath.includes("/")
        ? note.relPath.slice(0, note.relPath.lastIndexOf("/"))
        : "";
      setCreating(null);
      setPath(dir);
      setSelected(note);
    },
    [confirmLeave],
  );

  // A clicked link or `[[wiki-link]]`, classified relative to the note it sits
  // in (`fromRelPath`). External → browser; an in-clone note → open; a missing
  // in-clone note → offer to create at that path; a target that escapes the
  // clone or isn't a note → decline (never a bogus "create").
  const handleLink = useCallback(
    async (target: string, fromRelPath: string) => {
      const action = classifyLink(target, fromRelPath, wikiIndex);
      switch (action.kind) {
        case "external":
          void openUrl(action.url).catch((err) => toast(errMessage(err), "error"));
          return;
        case "anchor":
          // TODO: scroll to the heading once the editor supports in-doc navigation.
          return;
        case "outside":
          toast(`"${action.target}" links outside this space — can't open it here.`);
          return;
        case "decline":
          toast(`Can't open ${action.target} — not a note file.`);
          return;
        case "open":
          await openNote(action.note);
          return;
        case "create": {
          const rel = action.relPath;
          const slash = rel.lastIndexOf("/");
          const dir = slash === -1 ? "" : rel.slice(0, slash);
          const base = rel.slice(slash + 1).replace(/\.(md|markdown)$/i, "");
          const create = await ask(`"${base}" doesn't exist yet. Create it?`, {
            title: "Create note",
            kind: "info",
          });
          if (!create) return;
          if (!(await confirmLeave())) return;
          try {
            const created = await createNote(clone.path, dir, base);
            await Promise.all([reload(), reloadWiki()]);
            setCreating(null);
            setPath(dir);
            setSelected(created);
            toast(`Created ${created.name}`);
          } catch (err) {
            toast(errMessage(err), "error");
          }
          return;
        }
      }
    },
    [wikiIndex, openNote, confirmLeave, clone.path, reload, reloadWiki, toast],
  );

  // Back: close the open note → up one folder → out to Repos. One predictable
  // step at a time (the breadcrumb still jumps to any ancestor).
  const goBack = useCallback(async () => {
    if (busy) return; // mid commit/sync — match the Back button's disabled state
    if (selected) {
      await closeNote();
    } else if (browseMode === "recent") {
      setBrowseMode("tree"); // Recent → back to the folder tree
    } else if (path) {
      await navigate(path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
    } else if (await confirmLeave()) {
      onClose();
    }
  }, [busy, selected, browseMode, path, closeNote, navigate, confirmLeave, onClose]);

  // Hardware/keyboard "back": the mouse back button (X1) and ⌘/Ctrl+[.
  useEffect(() => {
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        void goBack();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "[") {
        // Let the editor keep ⌘[ for outdent when it has focus.
        if (document.activeElement?.closest(".cm-editor")) return;
        e.preventDefault();
        void goBack();
      }
    };
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [goBack]);

  const segments = path ? path.split("/") : [];
  // Title is the current folder name, or the repo itself at the root.
  const title = segments.length ? segments[segments.length - 1] : clone.slug;
  // README is pulled out of the notes list and shown as the folder's guide.
  const readme = files.find((f) => /^readme$/i.test(f.name));
  const noteFiles = readme ? files.filter((f) => f.relPath !== readme.relPath) : files;
  const empty = folders.length === 0 && files.length === 0;
  // The landing lists notes newest-edited first; keyed on `files` (stable per
  // load) so it doesn't re-sort on unrelated re-renders (busy / sync / rail).
  const notesByRecency = useMemo(() => {
    const readmeNote = files.find((f) => /^readme$/i.test(f.name));
    const notes = readmeNote ? files.filter((f) => f.relPath !== readmeNote.relPath) : files;
    return [...notes].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  }, [files]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-is-border px-3 py-2.5">
        {railCollapsed && (
          <button
            type="button"
            onClick={() => setRailCollapsed(false)}
            aria-label="Show files"
            title="Show files"
            className="hidden shrink-0 rounded-md p-1 text-is-text-tertiary transition hover:bg-is-surface-alt hover:text-is-text md:inline-flex"
          >
            <PanelLeft size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void goBack()}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-1 text-xs text-is-text-tertiary transition hover:text-is-text disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
        >
          <ArrowLeft size={14} strokeWidth={1.333} aria-hidden="true" />
          Back
        </button>
        <div className="min-w-0 flex-1">
          <Breadcrumb slug={clone.slug} segments={segments} onNavigate={(p) => void navigate(p)} />
        </div>
        {!selected && (
          <div className="flex shrink-0 items-center rounded-md border border-is-border p-0.5 text-xs">
            {(["tree", "recent"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setBrowseMode(mode)}
                aria-pressed={browseMode === mode}
                className={cn(
                  "rounded px-2 py-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring",
                  browseMode === mode
                    ? "bg-is-surface-alt text-is-text"
                    : "text-is-text-tertiary hover:text-is-text",
                )}
              >
                {mode === "tree" ? "Browse" : "Recent"}
              </button>
            ))}
          </div>
        )}
        <AddMenu
          onNewNote={() => void createNewNote()}
          onNewFolder={() => void startCreateFolder()}
          // Block creation until the listing is ready — reload() after creating
          // wouldn't surface the new item while loading/errored.
          disabled={busy || status !== "loaded"}
        />
      </div>

      <div
        ref={containerRef}
        className="flex min-h-0 flex-1"
        style={{ "--rail-width": `${railWidth}px` } as CSSProperties}
      >
        {/* Persistent file rail — folders + notes for the current folder,
            foldable + resizable. On mobile it's the full-width browse list when
            no note is open, and hides to give the editor the screen. */}
        <nav
          aria-label="Files"
          className={cn(
            "flex shrink-0 flex-col overflow-hidden border-r border-is-border",
            railCollapsed ? "md:hidden" : "md:w-[var(--rail-width)]",
            selected ? "max-md:hidden" : "max-md:w-full max-md:border-r-0",
          )}
        >
          <div className="flex items-center gap-1.5 border-b border-is-border px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-is-text-secondary">
              {title}
            </span>
            <CopyButton value={path || clone.slug} label="folder path" size={13} />
            <button
              type="button"
              onClick={() => setRailCollapsed(true)}
              aria-label="Hide files"
              title="Hide files"
              className="hidden rounded-md p-1 text-is-text-tertiary transition hover:bg-is-surface-alt hover:text-is-text md:inline-flex"
            >
              <PanelLeftClose size={15} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {status === "loading" && (
              <p className="px-2 py-1 text-xs text-is-text-tertiary">Loading…</p>
            )}
            {status === "error" && (
              <p className="px-2 py-1 text-xs text-is-danger-text">
                Couldn't load files.{" "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-is-text"
                  onClick={() => void reload()}
                >
                  Retry
                </button>
              </p>
            )}
            {status === "loaded" && (
              <div className="flex flex-col gap-3">
                {creating && (
                  <CreateRow onSubmit={(n) => void submitCreate(n)} onCancel={() => setCreating(null)} />
                )}
                {folders.length > 0 && (
                  <FolderList folders={folders} onOpen={(f) => void navigate(f.relPath)} />
                )}
                {noteFiles.length > 0 ? (
                  <NoteList
                    files={noteFiles}
                    selectedRel={selected?.relPath}
                    onSelect={(n) => void selectNote(n)}
                    disabled={busy}
                    compact
                  />
                ) : (
                  folders.length === 0 &&
                  !creating && (
                    <p className="px-2 py-1 text-xs text-is-text-tertiary">Empty folder.</p>
                  )
                )}
              </div>
            )}
          </div>
        </nav>
        {!railCollapsed && (
          <Resizer
            side="left"
            min={200}
            max={420}
            label="File rail width"
            containerRef={containerRef}
            width={railWidth}
            onResize={setRailWidth}
          />
        )}

        {/* Content — the open note, the Recent feed, or the folder's README. */}
        <section
          aria-label="Content"
          className={cn("flex min-w-0 flex-1 overflow-hidden", !selected && "max-md:hidden")}
        >
          {selected ? (
            <NotePane
              key={`${selected.path}:${editorKey}`}
              note={selected}
              clone={clone}
              onBusyChange={setBusy}
              onClose={() => void closeNote()}
              onLink={(t, from) => void handleLink(t, from)}
              onRetitle={retitleNote}
              autoFocusTitle={selected.path === newNotePath}
              resolveWiki={resolveWiki}
            />
          ) : browseMode === "recent" ? (
            <div className="min-w-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-3xl px-6 py-6">
                <h1 className="mb-5 text-xl font-medium text-is-text">Recent</h1>
                <RecentTimeline
                  notes={recent.notes}
                  status={recent.status}
                  error={recent.error}
                  disabled={busy}
                  onSelect={(n) => void openNote(n)}
                  onReload={() => void recent.reload()}
                />
              </div>
            </div>
          ) : (
            <div className="min-w-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-3xl px-6 py-8">
                {status === "loading" && <p className="text-sm text-is-text-tertiary">Loading…</p>}
                {status === "error" && (
                  <p className="text-sm text-is-danger-text">
                    {error}{" "}
                    <button
                      type="button"
                      className="underline underline-offset-2 hover:text-is-text"
                      onClick={() => void reload()}
                    >
                      Retry
                    </button>
                  </p>
                )}
                {status === "loaded" && (
                  <>
                    {readme && (
                      <ReadmeCard
                        key={readme.path}
                        note={readme}
                        onOpen={() => void selectNote(readme)}
                        onLink={(t, from) => void handleLink(t, from)}
                        resolveWiki={resolveWiki}
                      />
                    )}
                    {noteFiles.length > 0 ? (
                      <>
                        <SectionLabel>Notes</SectionLabel>
                        <FolderNotes
                          notes={notesByRecency}
                          disabled={busy}
                          onSelect={(n) => void selectNote(n)}
                        />
                      </>
                    ) : (
                      !readme && (
                        <div className="flex flex-col items-center py-20 text-center">
                          <FileText
                            size={28}
                            strokeWidth={1.333}
                            className="text-is-text-tertiary"
                            aria-hidden="true"
                          />
                          <p className="mt-3 max-w-sm text-sm text-is-text-tertiary">
                            {empty
                              ? "This folder is empty — add a note from the Add menu."
                              : "Pick a file on the left, or open a note to start writing."}
                          </p>
                        </div>
                      )
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
