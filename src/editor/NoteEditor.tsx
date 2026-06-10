import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { noteEditorExtensions } from "./extensions";
import "./editor.css";

// Live-preview markdown editor over a single note's raw content.
//
// Mount-per-note: the parent keys this by file path, so opening a different
// note remounts with fresh content — no doc-diffing, and the dirty/draft state
// resets cleanly. Callbacks are held in refs so the CM view is built once.
export function NoteEditor({
  initialContent,
  onChange,
  onSave,
  onLinkClick,
}: {
  initialContent: string;
  onChange: (doc: string) => void;
  onSave: () => void;
  onLinkClick: (url: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const onLinkClickRef = useRef(onLinkClick);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  onLinkClickRef.current = onLinkClick;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: initialContent,
        extensions: noteEditorExtensions({
          onChange: (doc) => onChangeRef.current(doc),
          onSave: () => onSaveRef.current(),
          // Links open in the OS browser; the host (NotePane) owns the opener
          // so it can surface failures via toast.
          onLinkClick: (url) => onLinkClickRef.current(url),
        }),
      }),
    });
    view.focus();

    return () => view.destroy();
    // initialContent is the mount-time seed only; the parent remounts per note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} className="cm-note-host h-full" />;
}
