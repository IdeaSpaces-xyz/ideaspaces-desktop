import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { defaultWorkspaceDir, setWorkspaceDir } from "../lib/workspace";
import { useToast } from "../toast/toast-context";

// Shows where clones land by default, with a picker to change it. Also hosts the
// folder-first "Link a folder" entry (auto-detects the space from the folder).
export function WorkspaceBar({
  onLinkFolder,
  linking,
}: {
  onLinkFolder?: () => void;
  linking?: boolean;
}) {
  const [dir, setDir] = useState("");
  const toast = useToast();

  useEffect(() => {
    defaultWorkspaceDir()
      .then(setDir)
      .catch(() => setDir("~/IdeaSpaces"));
  }, []);

  async function change() {
    const picked = await open({
      directory: true,
      multiple: false,
      title: "Choose where clones go",
    });
    if (typeof picked !== "string") return;
    try {
      await setWorkspaceDir(picked);
      setDir(picked);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    }
  }

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-is-text-tertiary">
        Clones go to <span className="text-is-text-secondary">{dir || "…"}</span>{" "}
        <button
          type="button"
          onClick={() => void change()}
          className="underline underline-offset-2 hover:text-is-text"
        >
          Change
        </button>
      </p>
      {onLinkFolder && (
        <button
          type="button"
          disabled={linking}
          onClick={() => void onLinkFolder()}
          title="Link a folder you already have on disk"
          className="inline-flex items-center gap-1.5 text-xs text-is-text-tertiary transition hover:text-is-text disabled:opacity-50"
        >
          <Link2 size={13} strokeWidth={1.333} aria-hidden="true" />
          {linking ? "Linking…" : "Link a folder…"}
        </button>
      )}
    </div>
  );
}
