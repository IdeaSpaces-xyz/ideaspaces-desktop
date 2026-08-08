import { useCallback, useEffect, useState } from "react";
import {
  PreviewPane,
  type PreviewEdit,
  type PreviewNodeState,
  type PreviewTarget,
} from "@ideaspaces/conversation-ui";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { openUrl } from "@tauri-apps/plugin-opener";
import { basename } from "../lib/path";
import { rootDisplayPath } from "./local-root-preview";
import { webUrl } from "../editor/linkResolve";
import { useToast } from "../toast/toast-context";

// A file in the conversation's context, opened in the shared PreviewPane. Reads
// content from disk; when `editable` (any doc in the workspace tree — the user's
// own writable file, mounts included), passes the edit IO so the pane's pencil
// writes straight back to the file. Sibling of LocalRootPreview (folders) and
// the remote NotePreview (server nodes).
export function LocalFilePreview({
  path,
  home,
  editable,
  width,
  onClose,
  onBack,
}: {
  /** Absolute path of the file. */
  path: string;
  /** Workspace home, for the display path under the title. */
  home: string;
  /** Any doc in the workspace tree is the user's own writable file (mounts
   *  included), so it opens editable; false only for a path outside the tree. */
  editable: boolean;
  width: number;
  onClose: () => void;
  /** Back to the context list — present when opened from it. */
  onBack?: () => void;
}) {
  const toast = useToast();
  const [nodeState, setNodeState] = useState<PreviewNodeState>({ status: "loading" });
  // Bumped after a save so the read view re-reads the file from disk.
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setNodeState({ status: "loading" });
    readTextFile(path)
      .then((content) => {
        if (alive)
          setNodeState({
            status: "loaded",
            node: { name: basename(path), path: rootDisplayPath(path, home), content },
          });
      })
      .catch((err) => {
        if (alive)
          setNodeState({ status: "error", error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      alive = false;
    };
  }, [path, home, reloadTick]);

  const edit: PreviewEdit | undefined = editable
    ? {
        load: () => readTextFile(path),
        save: async (content: string) => {
          await writeTextFile(path, content);
        },
      }
    : undefined;

  const onLinkClick = useCallback(
    (url: string) => {
      const web = webUrl(url);
      if (web) {
        void openUrl(web).catch((err) => toast(err instanceof Error ? err.message : String(err), "error"));
      } else {
        toast("Open the file in the editor to follow this link.");
      }
    },
    [toast],
  );

  const target: PreviewTarget = { id: path, label: basename(path) };

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
