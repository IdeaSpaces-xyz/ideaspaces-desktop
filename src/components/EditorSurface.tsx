import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookText,
  ChevronRight,
  FilePlus,
  FileText,
  Folder,
  FolderPlus,
  Plus,
  RefreshCw,
  Save,
  UploadCloud,
  X,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { WikiLinkResolvedTarget } from "@atomic-editor/editor";
import { NoteEditor } from "../editor/NoteEditor";
import { useDir } from "../editor/useDir";
import { useWikiIndex } from "../editor/useWikiIndex";
import { classifyLink } from "../editor/linkResolve";
import { setFrontmatterName } from "../editor/frontmatter";
import {
  createFolder,
  createNote,
  createUntitledNote,
  readNote,
  renameNote,
  writeNote,
  type FolderEntry,
  type NoteFile,
} from "../lib/notes";
import { ask } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { commitClone, syncClone, type CloneRecord } from "../lib/cli";
import { useToast } from "../toast/toast-context";
import { Resizer } from "./Resizer";
import { CopyButton } from "./CopyButton";
import { cn } from "../lib/cn";

const barBtn =
  "inline-flex items-center gap-1.5 rounded-md border border-is-border bg-is-surface px-2.5 py-1.5 text-xs text-is-text-secondary transition hover:border-is-accent hover:text-is-text disabled:cursor-not-allowed disabled:opacity-50";

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// One opened note: loads its content, holds the draft + dirty state, saves to
// disk, and commits+pushes via the CLI. Keyed by path so each note gets fresh
// state (NoteEditor mounts per note). Rendered in the resizable right pane.
function NotePane({
  note,
  clone,
  onDirtyChange,
  onBusyChange,
  onClose,
  onLink,
  onRetitle,
  autoFocusTitle,
  resolveWiki,
}: {
  note: NoteFile;
  clone: CloneRecord;
  onDirtyChange: (dirty: boolean) => void;
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
  // Baseline the dirty check tracks: the last text written to disk (initially
  // the loaded text). Without this, an edit-then-save-then-edit cycle compares
  // against the original load and shows false "unsaved".
  const savedRef = useRef("");
  const [dirty, setDirty] = useState(false);
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

  // Report dirty up so the surface can guard navigation; clear it on unmount
  // (note switch) so the next note starts clean.
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  // Report publish-in-flight up so the surface blocks navigation mid-commit/sync.
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

  const save = useCallback(async (): Promise<boolean> => {
    try {
      await writeNote(note.path, draftRef.current);
      savedRef.current = draftRef.current;
      setDirty(false);
      return true;
    } catch (err) {
      toast(errMessage(err), "error");
      return false;
    }
  }, [note.path, toast]);

  const commitAndSync = useCallback(async () => {
    setBusy(true);
    try {
      if (dirty && !(await save())) return;
      try {
        // Scoped commit: only this note's path, never other staged work.
        await commitClone(clone.path, `Edit ${note.relPath}`, [note.relPath]);
      } catch (err) {
        // Nothing new to commit for this note is fine — fall through and sync
        // to push any already-committed history. (Matches the CLI/git "nothing
        // to commit" text; TODO: a machine-readable signal from the CLI would
        // be more robust on non-English systems.)
        if (!/nothing to commit|no changes/i.test(errMessage(err))) throw err;
      }
      const res = await syncClone(clone.path);
      toast(
        res.pushed
          ? `Published ${note.name} — pushed ${res.pushed} commit${res.pushed === 1 ? "" : "s"}`
          : `Synced ${note.name} — already up to date`,
      );
    } catch (err) {
      toast(errMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }, [clone.path, note.relPath, note.name, dirty, save, toast]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-is-surface">
      <div className="flex items-center justify-between gap-3 border-b border-is-border px-5 py-2.5">
        <p className="flex min-w-0 items-center gap-1 text-xs text-is-text-tertiary">
          <span className="truncate">{note.relPath}</span>
          {dirty && <span className="shrink-0 text-is-text-secondary">• unsaved</span>}
          <CopyButton value={note.relPath} label="note path" />
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className={barBtn}
            disabled={!dirty || busy}
            onClick={() => void save()}
            title="Save (⌘S)"
          >
            <Save size={14} strokeWidth={1.333} aria-hidden="true" />
            Save
          </button>
          <button type="button" className={barBtn} disabled={busy} onClick={() => void commitAndSync()}>
            {busy ? (
              <RefreshCw size={14} strokeWidth={1.333} className="animate-spin" aria-hidden="true" />
            ) : (
              <UploadCloud size={14} strokeWidth={1.333} aria-hidden="true" />
            )}
            {busy ? "Publishing…" : "Commit & sync"}
          </button>
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
                setDirty(doc !== savedRef.current);
              }}
              onSave={() => void save()}
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

// The folder's README at the top as a compact, read-only teaser — a clamped
// live-preview with a fade and a "Read more" that opens the full note in the
// editor pane. Keyed by path so navigating folders remounts with the new README.
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
  // Whether the rendered README is taller than the clamp — drives the fade and
  // the "Read more" vs "Open" affordance, so a short README isn't a false teaser.
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

  return (
    <div className="mb-6 overflow-hidden rounded-lg border border-is-border bg-is-surface">
      <div className="flex items-center gap-2 border-b border-is-border px-4 py-2.5">
        <BookText size={15} strokeWidth={1.333} className="shrink-0 text-is-text-tertiary" aria-hidden="true" />
        <span className="flex-1 text-sm font-medium text-is-text">README</span>
      </div>
      {error ? (
        <p className="px-4 py-3 text-sm text-is-danger-text">{error}</p>
      ) : content === null ? (
        <p className="px-4 py-3 text-sm text-is-text-tertiary">Loading…</p>
      ) : (
        <>
          {/* Clamped teaser; the fade only shows when there's more below. */}
          <div className="relative max-h-44 overflow-hidden px-4 py-3">
            <div ref={innerRef}>
              <NoteEditor
                initialContent={content}
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
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-is-surface to-transparent" />
            )}
          </div>
          <button
            type="button"
            onClick={onOpen}
            className="flex w-full items-center justify-center gap-1 border-t border-is-border px-4 py-2 text-xs text-is-accent-text transition hover:bg-is-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
          >
            {overflowing ? "Read more" : "Open in editor"}
            <ArrowRight size={13} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </>
      )}
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

// The editor surface for one local clone: a folder-drill-in tree on the left
// (breadcrumb + Folders + Notes), and the selected note open in a resizable
// live-preview editor pane on the right. Mirrors is_web v2's repo browser, with
// the desktop twist that the right pane *is* the editor (no read-only → edit
// toggle — the live-preview surface is editable in place).
export function EditorSurface({ clone, onClose }: { clone: CloneRecord; onClose: () => void }) {
  const toast = useToast();
  const [path, setPath] = useState("");
  const [selected, setSelected] = useState<NoteFile | undefined>(undefined);
  // Width of the slim note rail in Focus mode (a note is open). The editor takes
  // the rest of the width.
  const [railWidth, setRailWidth] = useState(256);
  // Bumped on retitle to force the editor to remount even when the path is
  // unchanged (a title edit that slugs to the same filename).
  const [editorKey, setEditorKey] = useState(0);
  // The just-created note's path — its pane focuses the title field instead of
  // the body (a precise signal, vs. guessing from an "untitled" filename).
  const [newNotePath, setNewNotePath] = useState<string | undefined>(undefined);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  // Only folders use the inline create row now; new notes open blank + titled.
  const [creating, setCreating] = useState<"folder" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { status, folders, files, error, reload } = useDir(clone.path, path);
  const { index: wikiIndex, reload: reloadWiki } = useWikiIndex(clone.path);

  // Guard navigation: never leave mid-publish, and confirm before dropping the
  // open note's unsaved edits. Native Tauri dialog (consistent across webview
  // backends, unlike window.confirm).
  const confirmLeave = useCallback(async (): Promise<boolean> => {
    if (busy) return false;
    if (!dirty) return true;
    return ask("Discard unsaved changes to this note?", {
      title: "Unsaved changes",
      kind: "warning",
    });
  }, [busy, dirty]);

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
    } else if (path) {
      await navigate(path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
    } else if (await confirmLeave()) {
      onClose();
    }
  }, [busy, selected, path, closeNote, navigate, confirmLeave, onClose]);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-is-border px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <Breadcrumb slug={clone.slug} segments={segments} onNavigate={(p) => void navigate(p)} />
        </div>
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
        {selected ? (
          // FOCUS: a note is open — slim active-branch rail + a dominant editor.
          <>
            <nav
              aria-label="Notes in this folder"
              className="flex shrink-0 flex-col overflow-hidden border-r border-is-border md:w-[var(--rail-width)] max-md:hidden"
            >
              <div className="flex items-center gap-2 border-b border-is-border px-3 py-2.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void goBack()}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md text-xs text-is-text-tertiary transition hover:text-is-text disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
                >
                  <ArrowLeft size={14} strokeWidth={1.333} aria-hidden="true" />
                  Back
                </button>
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-is-text-secondary">
                  {title}
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {status === "loading" && (
                  <p className="px-2 py-1 text-xs text-is-text-tertiary">Loading…</p>
                )}
                {status === "error" && (
                  <p className="px-2 py-1 text-xs text-is-danger-text">Couldn't load notes.</p>
                )}
                {status === "loaded" &&
                  (noteFiles.length > 0 ? (
                    <NoteList
                      files={noteFiles}
                      selectedRel={selected.relPath}
                      onSelect={(n) => void selectNote(n)}
                      disabled={busy}
                      compact
                    />
                  ) : (
                    <p className="px-2 py-1 text-xs text-is-text-tertiary">No other notes here.</p>
                  ))}
              </div>
            </nav>
            <Resizer
              side="left"
              min={200}
              max={420}
              label="Note list width"
              containerRef={containerRef}
              width={railWidth}
              onResize={setRailWidth}
            />
            <section
              aria-label="Note editor"
              className="flex min-w-0 flex-1 overflow-hidden max-md:fixed max-md:inset-0 max-md:z-40"
            >
              <NotePane
                key={`${selected.path}:${editorKey}`}
                note={selected}
                clone={clone}
                onDirtyChange={setDirty}
                onBusyChange={setBusy}
                onClose={() => void closeNote()}
                onLink={(t, from) => void handleLink(t, from)}
                onRetitle={retitleNote}
                autoFocusTitle={selected.path === newNotePath}
                resolveWiki={resolveWiki}
              />
            </section>
          </>
        ) : (
          // BROWSE: no note open — the full folder tree.
          <nav className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-3xl px-6 py-6">
              <div className="mb-5 flex items-center gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void goBack()}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md text-xs text-is-text-tertiary transition hover:text-is-text disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
                >
                  <ArrowLeft size={14} strokeWidth={1.333} aria-hidden="true" />
                  Back
                </button>
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <h1 className="min-w-0 truncate text-xl font-medium text-is-text">{title}</h1>
                  <CopyButton value={path || clone.slug} label="folder path" size={14} />
                </div>
              </div>
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
                  {creating && (
                    <CreateRow onSubmit={(n) => void submitCreate(n)} onCancel={() => setCreating(null)} />
                  )}
                  {readme && (
                    <ReadmeCard
                      key={readme.path}
                      note={readme}
                      onOpen={() => void selectNote(readme)}
                      onLink={(t, from) => void handleLink(t, from)}
                      resolveWiki={resolveWiki}
                    />
                  )}
                  {empty && !readme && !creating ? (
                    <p className="text-sm text-is-text-tertiary">This folder has no notes or sub-folders.</p>
                  ) : folders.length > 0 ? (
                    <div className="grid gap-x-8 gap-y-6 sm:grid-cols-[12rem_minmax(0,1fr)]">
                      <FolderList folders={folders} onOpen={(f) => void navigate(f.relPath)} />
                      {noteFiles.length > 0 ? (
                        <NoteList
                          files={noteFiles}
                          selectedRel={undefined}
                          onSelect={(n) => void selectNote(n)}
                          disabled={busy}
                        />
                      ) : (
                        <p className="text-sm text-is-text-tertiary">No notes in this folder.</p>
                      )}
                    </div>
                  ) : (
                    noteFiles.length > 0 && (
                      <NoteList
                        files={noteFiles}
                        selectedRel={undefined}
                        onSelect={(n) => void selectNote(n)}
                        disabled={busy}
                      />
                    )
                  )}
                </>
              )}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}
