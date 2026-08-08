import { useCallback, useEffect, useState } from "react";
import {
  PreviewPane,
  type PreviewEdit,
  type PreviewNodeState,
  type PreviewTarget,
} from "@ideaspaces/conversation-ui";
import { openUrl } from "@tauri-apps/plugin-opener";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { loadRootPreview } from "./local-root-preview";
import { basename } from "../lib/path";
import { webUrl } from "../editor/linkResolve";
import { useToast } from "../toast/toast-context";

// The preview slot of the local Context panel: a mounted root (or home) rendered
// through the shared PreviewPane — its README, or a shallow listing. The README
// is a real file the user owns, so it's editable (pencil → save writes back);
// the generated listing has no file to edit and stays read-only. Sibling of the
// remote NotePreview, minus the server node get/put — content comes from disk.
export function LocalRootPreview({
  root,
  home,
  width,
  onClose,
  onBack,
}: {
  /** Absolute path of the root being previewed. */
  root: string;
  /** The workspace home, for the display path under the title. */
  home: string;
  width: number;
  onClose: () => void;
  /** Back to the context list — present when opened from it. */
  onBack?: () => void;
}) {
  const toast = useToast();
  const [nodeState, setNodeState] = useState<PreviewNodeState>({ status: "loading" });
  // The README's absolute path when the preview is an editable README (undefined
  // for the listing fallback). Bump reloadTick after a save to re-read from disk.
  const [readmePath, setReadmePath] = useState<string | undefined>(undefined);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setNodeState({ status: "loading" });
    loadRootPreview(root, home)
      .then((preview) => {
        if (!alive) return;
        setNodeState({ status: "loaded", node: preview.node });
        setReadmePath(preview.readmePath);
      })
      .catch((err) => {
        if (alive)
          setNodeState({ status: "error", error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      alive = false;
    };
  }, [root, home, reloadTick]);

  const edit: PreviewEdit | undefined = readmePath
    ? {
        load: () => readTextFile(readmePath),
        save: async (content: string) => {
          await writeTextFile(readmePath, content);
        },
      }
    : undefined;

  const onLinkClick = useCallback(
    (url: string) => {
      const web = webUrl(url);
      if (web) {
        void openUrl(web).catch((err) => toast(err instanceof Error ? err.message : String(err), "error"));
      } else {
        toast("Open the folder to follow this link.");
      }
    },
    [toast],
  );

  const target: PreviewTarget = { id: root, label: basename(root) };

  return (
    <PreviewPane
      target={target}
      nodeState={nodeState}
      edit={edit}
      onClose={onClose}
      onBack={onBack}
      onSaved={() => setReloadTick((t) => t + 1)}
      onLinkClick={onLinkClick}
      onError={(message) => toast(message, "error")}
      style={{ width }}
    />
  );
}
