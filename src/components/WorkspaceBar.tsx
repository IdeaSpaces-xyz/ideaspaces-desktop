import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { defaultWorkspaceDir, setWorkspaceDir } from "../lib/workspace";
import { useToast } from "../toast/toast-context";

// Shows where clones land by default, with a picker to change it.
export function WorkspaceBar() {
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
    <p className="mb-3 text-xs text-is-text-tertiary">
      Clones go to <span className="text-is-text-secondary">{dir || "…"}</span>{" "}
      <button
        type="button"
        onClick={() => void change()}
        className="underline underline-offset-2 hover:text-is-text"
      >
        Change
      </button>
    </p>
  );
}
