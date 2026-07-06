import { useCallback, useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";
import { addOpenedFolder, getOpenedFolders, removeOpenedFolder } from "../lib/opened-folders";
import { useToast } from "../toast/toast-context";

// A picked path is workable only if it's under the home tree — the app's `fs`
// capabilities are scoped to `$HOME/**` (see src-tauri/capabilities/default.json,
// which is deliberately narrow, with a TODO to tighten further). Opening a folder
// outside it would let the editor read the tree but silently fail every write, so
// we reject it up front instead.
function isInsideHome(path: string, home: string): boolean {
  const h = home.replace(/\/+$/, "");
  return path === h || path.startsWith(h + "/");
}

// The accountless folders the user has opened, persisted (newest-first). Auth-
// independent — a folder is a context you can work in with or without a login.
export function useOpenedFolders() {
  const [folders, setFolders] = useState<string[]>([]);
  const toast = useToast();

  useEffect(() => {
    void getOpenedFolders().then(setFolders);
  }, []);

  // Pick a folder via the OS dialog; returns its path so the caller can select
  // it as the active context (or null if dismissed / outside the home tree).
  const openFolder = useCallback(async (): Promise<string | null> => {
    const picked = await openDialog({ directory: true, multiple: false, title: "Open a folder" });
    if (typeof picked !== "string") return null;
    if (!isInsideHome(picked, await homeDir())) {
      toast("For now you can only open folders inside your home directory.", "error");
      return null;
    }
    setFolders(await addOpenedFolder(picked));
    return picked;
  }, [toast]);

  const closeFolder = useCallback(async (path: string) => {
    setFolders(await removeOpenedFolder(path));
  }, []);

  return { folders, openFolder, closeFolder };
}
