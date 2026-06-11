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
import { wikiTargetName } from "../editor/wikiIndex";
import { createFolder, createNote, readNote, writeNote, type FolderEntry, type NoteFile } from "../lib/notes";
import { ask } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { commitClone, syncClone, type CloneRecord } from "../lib/cli";
import { useToast } from "../toast/toast-context";
import { Resizer } from "./Resizer";
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
  onLinkClick,
  onWikiOpen,
  resolveWiki,
}: {
  note: NoteFile;
  clone: CloneRecord;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
  onLinkClick: (url: string) => void;
  onWikiOpen: (target: string) => void;
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
        <div className="min-w-0">
          <p className="truncate font-medium text-is-text">{note.name}</p>
          <p className="truncate text-xs text-is-text-tertiary">
            {note.relPath}
            {dirty && <span className="ml-2 text-is-text-secondary">• unsaved</span>}
          </p>
        </div>
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
      <div className="min-h-0 flex-1 px-6">
        {loadError ? (
          <p className="p-6 text-sm text-is-danger-text">{loadError}</p>
        ) : content === null ? (
          <p className="p-6 text-sm text-is-text-tertiary">Loading note…</p>
        ) : (
          <NoteEditor
            initialContent={content}
            onChange={(doc) => {
              draftRef.current = doc;
              setDirty(doc !== savedRef.current);
            }}
            onSave={() => void save()}
            onLinkClick={onLinkClick}
            onWikiOpen={onWikiOpen}
            resolveWiki={resolveWiki}
          />
        )}
      </div>
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

function NoteList({
  files,
  selectedRel,
  onSelect,
  disabled,
}: {
  files: NoteFile[];
  selectedRel: string | undefined;
  onSelect: (note: NoteFile) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <SectionLabel>Notes</SectionLabel>
      <ul className="flex flex-col gap-1.5">
        {files.map((note) => {
          const active = selectedRel === note.relPath;
          return (
            <li key={note.relPath}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(note)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring",
                  active
                    ? "border-is-border bg-is-surface-alt"
                    : "border-transparent hover:border-is-border hover:bg-is-surface-alt",
                )}
                title={note.summary ? `${note.relPath} — ${note.summary}` : note.relPath}
              >
                <FileText size={16} strokeWidth={1.333} className="shrink-0 text-is-text-tertiary" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-is-text">{note.name}</span>
                  {note.summary && (
                    <span className="mt-0.5 block truncate text-xs text-is-text-tertiary">{note.summary}</span>
                  )}
                </span>
              </button>
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
  onLinkClick,
  onWikiOpen,
  resolveWiki,
}: {
  note: NoteFile;
  onOpen: () => void;
  onLinkClick: (url: string) => void;
  onWikiOpen: (target: string) => void;
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
                onLinkClick={onLinkClick}
                onWikiOpen={onWikiOpen}
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

// Inline name input for creating a note/folder in the current path.
function CreateRow({
  kind,
  onSubmit,
  onCancel,
}: {
  kind: "note" | "folder";
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSubmit(name);
      }}
      className="mb-4 flex items-center gap-2"
    >
      {kind === "folder" ? (
        <FolderPlus size={16} strokeWidth={1.333} className="shrink-0 text-is-text-tertiary" aria-hidden="true" />
      ) : (
        <FilePlus size={16} strokeWidth={1.333} className="shrink-0 text-is-text-tertiary" aria-hidden="true" />
      )}
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        placeholder={kind === "folder" ? "New folder name" : "New note name"}
        aria-label={kind === "folder" ? "New folder name" : "New note name"}
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
  const [paneWidth, setPaneWidth] = useState(540);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState<null | "note" | "folder">(null);
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
      const kind = creating;
      if (!kind) return;
      try {
        if (kind === "folder") {
          await createFolder(clone.path, path, name);
          await reload();
        } else {
          // Opening the new note replaces any open one — guard unsaved edits.
          if (!(await confirmLeave())) return;
          const note = await createNote(clone.path, path, name);
          await Promise.all([reload(), reloadWiki()]);
          setSelected(note);
        }
        setCreating(null);
      } catch (err) {
        toast(errMessage(err), "error");
      }
    },
    [creating, clone.path, path, reload, reloadWiki, confirmLeave, toast],
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

  // Click a `[[wiki-link]]`: open the matching note, or offer to create it
  // (Obsidian-style). A new note is created in the current folder, blank.
  const openWiki = useCallback(
    async (target: string) => {
      const note = wikiIndex.resolve(target);
      if (note) {
        if (!(await confirmLeave())) return;
        const dir = note.relPath.includes("/")
          ? note.relPath.slice(0, note.relPath.lastIndexOf("/"))
          : "";
        setCreating(null);
        setPath(dir);
        setSelected(note);
        return;
      }
      const name = wikiTargetName(target);
      if (!name) {
        toast("That link has no note name to create.", "error");
        return;
      }
      const create = await ask(`"${name}" doesn't exist yet. Create it?`, {
        title: "Create note",
        kind: "info",
      });
      if (!create) return;
      if (!(await confirmLeave())) return;
      try {
        const created = await createNote(clone.path, path, name);
        await Promise.all([reload(), reloadWiki()]);
        setCreating(null);
        setSelected(created);
        toast(`Created ${created.name}`);
      } catch (err) {
        toast(errMessage(err), "error");
      }
    },
    [wikiIndex, reloadWiki, confirmLeave, clone.path, path, reload, toast],
  );

  // A clicked link: external schemes (http:, https:, mailto:, …) open in the OS
  // browser; everything else is a link to a note in the clone (`[[wiki]]` or a
  // relative `note.md`), so route it through the same resolve-or-create path —
  // never `openUrl`, which rejects non-web URLs.
  const handleLink = useCallback(
    (url: string) => {
      if (/^[a-z][a-z\d+.-]*:/i.test(url)) {
        void openUrl(url).catch((err) => toast(errMessage(err), "error"));
      } else {
        void openWiki(url);
      }
    },
    [openWiki, toast],
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
          onNewNote={() => setCreating("note")}
          onNewFolder={() => setCreating("folder")}
          // Block creation until the listing is ready — reload() after creating
          // wouldn't surface the new item while loading/errored.
          disabled={busy || status !== "loaded"}
        />
      </div>

      <div ref={containerRef} className="flex min-h-0 flex-1" style={{ "--pane-width": `${paneWidth}px` } as CSSProperties}>
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
              <h1 className="min-w-0 flex-1 truncate text-xl font-medium text-is-text">{title}</h1>
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
                  <CreateRow
                    kind={creating}
                    onSubmit={(n) => void submitCreate(n)}
                    onCancel={() => setCreating(null)}
                  />
                )}
                {readme && (
                  <ReadmeCard
                    key={readme.path}
                    note={readme}
                    onOpen={() => void selectNote(readme)}
                    onLinkClick={handleLink}
                    onWikiOpen={(t) => void openWiki(t)}
                    resolveWiki={resolveWiki}
                  />
                )}
                {empty && !readme && !creating ? (
                  <p className="text-sm text-is-text-tertiary">This folder has no notes or sub-folders.</p>
                ) : folders.length > 0 ? (
                  // Folders present → two columns (folder rail + notes).
                  <div className="grid gap-x-8 gap-y-6 sm:grid-cols-[12rem_minmax(0,1fr)]">
                    <FolderList folders={folders} onOpen={(f) => void navigate(f.relPath)} />
                    {noteFiles.length > 0 ? (
                      <NoteList
                        files={noteFiles}
                        selectedRel={selected?.relPath}
                        onSelect={(n) => void selectNote(n)}
                        disabled={busy}
                      />
                    ) : (
                      <p className="text-sm text-is-text-tertiary">No notes in this folder.</p>
                    )}
                  </div>
                ) : (
                  // No folders → the notes list gets the full width.
                  noteFiles.length > 0 && (
                    <NoteList
                      files={noteFiles}
                      selectedRel={selected?.relPath}
                      onSelect={(n) => void selectNote(n)}
                      disabled={busy}
                    />
                  )
                )}
              </>
            )}
          </div>
        </nav>

        {selected && (
          <>
            <Resizer containerRef={containerRef} width={paneWidth} onResize={setPaneWidth} />
            <section
              aria-label="Note editor"
              className="flex shrink-0 overflow-hidden border-l border-is-border md:w-[var(--pane-width)] max-md:fixed max-md:inset-0 max-md:z-40 max-md:w-full"
            >
              <NotePane
                key={selected.path}
                note={selected}
                clone={clone}
                onDirtyChange={setDirty}
                onBusyChange={setBusy}
                onClose={() => void closeNote()}
                onLinkClick={handleLink}
                onWikiOpen={(t) => void openWiki(t)}
                resolveWiki={resolveWiki}
              />
            </section>
          </>
        )}
      </div>
    </div>
  );
}
