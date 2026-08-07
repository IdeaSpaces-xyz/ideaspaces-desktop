import { useCallback, useEffect, useState } from "react";
import { PreviewPane, type PreviewNodeState, type PreviewTarget } from "@ideaspaces/conversation-ui";
import { openUrl } from "@tauri-apps/plugin-opener";
import { loadRootPreview } from "./local-root-preview";
import { basename } from "../lib/path";
import { webUrl } from "../editor/linkResolve";
import { useToast } from "../toast/toast-context";

// The preview slot of the local Context panel: a mounted root (or home) rendered
// read-only through the shared PreviewPane — its README, or a shallow listing.
// Read-only always (no `edit`): the working set is reference context, not the
// workspace the turn writes to. Sibling of the remote NotePreview, minus the
// server node get/put — content comes from disk.
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

  useEffect(() => {
    let alive = true;
    setNodeState({ status: "loading" });
    loadRootPreview(root, home)
      .then((node) => {
        if (alive) setNodeState({ status: "loaded", node });
      })
      .catch((err) => {
        if (alive)
          setNodeState({ status: "error", error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      alive = false;
    };
  }, [root, home]);

  // A web link opens the browser; anything else can't be followed from a
  // read-only reference (no editor to route into), so say so rather than no-op.
  const onLinkClick = useCallback(
    (url: string) => {
      const web = webUrl(url);
      if (web) {
        void openUrl(web).catch((err) => toast(err instanceof Error ? err.message : String(err), "error"));
      } else {
        toast("This is a read-only reference — open the folder to follow its links.");
      }
    },
    [toast],
  );

  const target: PreviewTarget = { id: root, label: basename(root) };

  return (
    <PreviewPane
      target={target}
      nodeState={nodeState}
      onClose={onClose}
      onBack={onBack}
      onLinkClick={onLinkClick}
      onError={(message) => toast(message, "error")}
      style={{ width }}
    />
  );
}
