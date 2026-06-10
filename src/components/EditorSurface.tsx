import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ChevronRight, FileText, Folder, RefreshCw, Save, UploadCloud, X } from "lucide-react";
import { NoteEditor } from "../editor/NoteEditor";
import { useDir } from "../editor/useDir";
import { readNote, writeNote, type FolderEntry, type NoteFile } from "../lib/notes";
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
}: {
  note: NoteFile;
  clone: CloneRecord;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
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
            onLinkClick={(url) => void openUrl(url).catch((err) => toast(errMessage(err), "error"))}
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
      <ul className="flex flex-col gap-0.5">
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
                  "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring",
                  active ? "bg-is-surface-alt" : "hover:bg-is-surface-alt",
                )}
                title={note.relPath}
              >
                <FileText size={15} strokeWidth={1.333} className="mt-0.5 shrink-0 text-is-text-tertiary" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-is-text">{note.name}</span>
                  {note.summary && (
                    <span className="block truncate text-xs text-is-text-secondary">{note.summary}</span>
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

// The editor surface for one local clone: a folder-drill-in tree on the left
// (breadcrumb + Folders + Notes), and the selected note open in a resizable
// live-preview editor pane on the right. Mirrors is_web v2's repo browser, with
// the desktop twist that the right pane *is* the editor (no read-only → edit
// toggle — the live-preview surface is editable in place).
export function EditorSurface({ clone, onClose }: { clone: CloneRecord; onClose: () => void }) {
  const [path, setPath] = useState("");
  const [selected, setSelected] = useState<NoteFile | undefined>(undefined);
  const [paneWidth, setPaneWidth] = useState(540);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { status, folders, files, error, reload } = useDir(clone.path, path);

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

  const segments = path ? path.split("/") : [];
  const empty = folders.length === 0 && files.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-is-border px-4 py-2.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => void confirmLeave().then((ok) => ok && onClose())}
          className="inline-flex shrink-0 items-center gap-1.5 text-xs text-is-text-tertiary transition hover:text-is-text disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowLeft size={14} strokeWidth={1.333} aria-hidden="true" />
          Repos
        </button>
        <span className="h-3.5 w-px shrink-0 bg-is-border" aria-hidden="true" />
        <Breadcrumb slug={clone.slug} segments={segments} onNavigate={(p) => void navigate(p)} />
      </div>

      <div ref={containerRef} className="flex min-h-0 flex-1" style={{ "--pane-width": `${paneWidth}px` } as CSSProperties}>
        <nav className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl px-5 py-6">
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
            {status === "loaded" &&
              (empty ? (
                <p className="text-sm text-is-text-tertiary">This folder has no notes or sub-folders.</p>
              ) : (
                <div className="grid gap-x-8 gap-y-6 sm:grid-cols-[11rem_minmax(0,1fr)]">
                  {folders.length > 0 && <FolderList folders={folders} onOpen={(f) => void navigate(f.relPath)} />}
                  {files.length > 0 ? (
                    <NoteList
                      files={files}
                      selectedRel={selected?.relPath}
                      onSelect={(n) => void selectNote(n)}
                      disabled={busy}
                    />
                  ) : (
                    <p className="text-sm text-is-text-tertiary">No notes in this folder.</p>
                  )}
                </div>
              ))}
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
              />
            </section>
          </>
        )}
      </div>
    </div>
  );
}
