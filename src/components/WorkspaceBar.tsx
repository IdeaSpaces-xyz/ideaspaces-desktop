import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { defaultWorkspaceDir, setWorkspaceDir } from "../lib/workspace";

// Shows where clones land by default, with a picker to change it.
export function WorkspaceBar() {
  const [dir, setDir] = useState("");

  useEffect(() => {
    void defaultWorkspaceDir().then(setDir);
  }, []);

  async function change() {
    const picked = await open({
      directory: true,
      multiple: false,
      title: "Choose where clones go",
    });
    if (typeof picked === "string") {
      setWorkspaceDir(picked);
      setDir(picked);
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
