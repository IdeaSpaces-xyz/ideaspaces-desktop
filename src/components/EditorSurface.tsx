import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, FileText, RefreshCw, Save, UploadCloud } from "lucide-react";
import { NoteEditor } from "../editor/NoteEditor";
import { useNotes } from "../editor/useNotes";
import { readNote, writeNote, type NoteFile } from "../lib/notes";
import { commitClone, syncClone, type CloneRecord } from "../lib/cli";
import { useToast } from "../toast/toast-context";

const barBtn =
  "inline-flex items-center gap-1.5 rounded-md border border-is-border bg-is-surface px-2.5 py-1.5 text-xs text-is-text-secondary transition hover:border-is-accent hover:text-is-text disabled:cursor-not-allowed disabled:opacity-50";

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// One opened note: loads its content, holds the draft + dirty state, saves to
// disk, and commits+pushes via the CLI. Keyed by path so each note gets fresh
// state (NoteEditor mounts per note).
function NotePane({
  note,
  clone,
  onDirtyChange,
}: {
  note: NoteFile;
  clone: CloneRecord;
  onDirtyChange: (dirty: boolean) => void;
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
        await commitClone(clone.path, `Edit ${note.relPath}`, [note.relPath]);
      } catch (err) {
        // Nothing new to commit for this note is fine — fall through and sync
        // to push any already-committed history.
        if (!/nothing to commit/i.test(errMessage(err))) throw err;
      }
      const res = await syncClone(clone.path);
      toast(`Published ${note.name} — pushed ${res.pushed}`);
    } catch (err) {
      toast(errMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }, [clone.path, note.relPath, note.name, dirty, save, toast]);

  if (loadError) {
    return <p className="p-6 text-sm text-is-danger-text">{loadError}</p>;
  }
  if (content === null) {
    return <p className="p-6 text-sm text-is-text-tertiary">Loading note…</p>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-is-border px-6 py-2.5">
        <p className="truncate text-sm text-is-text-secondary">
          {note.relPath}
          {dirty && <span className="ml-2 text-is-text-tertiary">• unsaved</span>}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" className={barBtn} disabled={!dirty || busy} onClick={() => void save()}>
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
        </div>
      </div>
      <div className="min-h-0 flex-1 px-6">
        <NoteEditor
          initialContent={content}
          onChange={(doc) => {
            draftRef.current = doc;
            setDirty(doc !== savedRef.current);
          }}
          onSave={() => void save()}
        />
      </div>
    </div>
  );
}

// The editor surface for one local clone: note list on the left, the opened
// note on the right.
export function EditorSurface({ clone, onClose }: { clone: CloneRecord; onClose: () => void }) {
  const { status, notes, error, reload } = useNotes(clone.path);
  const [selected, setSelected] = useState<NoteFile | undefined>(undefined);
  const [dirty, setDirty] = useState(false);

  // Guard navigation that would drop the open note's unsaved edits.
  function confirmLeave(): boolean {
    return !dirty || window.confirm("Discard unsaved changes to this note?");
  }
  function selectNote(note: NoteFile) {
    if (note.relPath === selected?.relPath || confirmLeave()) setSelected(note);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-is-border px-4 py-2.5">
        <button
          type="button"
          onClick={() => confirmLeave() && onClose()}
          className="inline-flex items-center gap-1.5 text-xs text-is-text-tertiary transition hover:text-is-text"
        >
          <ArrowLeft size={14} strokeWidth={1.333} aria-hidden="true" />
          Repos
        </button>
        <span className="text-sm font-medium text-is-text">{clone.slug}</span>
      </div>

      <div className="flex min-h-0 flex-1">
        <nav className="w-64 shrink-0 overflow-y-auto border-r border-is-border px-2 py-3">
          {status === "loading" && <p className="px-2 text-xs text-is-text-tertiary">Loading notes…</p>}
          {status === "error" && (
            <p className="px-2 text-xs text-is-danger-text">
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
            (notes.length === 0 ? (
              <p className="px-2 text-xs text-is-text-tertiary">No markdown notes in this clone.</p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {notes.map((note) => (
                  <li key={note.relPath}>
                    <button
                      type="button"
                      onClick={() => selectNote(note)}
                      aria-current={selected?.relPath === note.relPath}
                      className={`flex w-full items-center gap-2 truncate rounded-md px-2 py-1.5 text-left text-sm transition ${
                        selected?.relPath === note.relPath
                          ? "bg-is-surface-alt text-is-text"
                          : "text-is-text-secondary hover:bg-is-surface-alt"
                      }`}
                      title={note.relPath}
                    >
                      <FileText size={14} strokeWidth={1.333} className="shrink-0 text-is-text-tertiary" aria-hidden="true" />
                      <span className="truncate">{note.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ))}
        </nav>

        {selected ? (
          <NotePane key={selected.path} note={selected} clone={clone} onDirtyChange={setDirty} />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-is-text-tertiary">Select a note to edit.</p>
          </div>
        )}
      </div>
    </div>
  );
}
