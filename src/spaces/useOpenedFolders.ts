import { useCallback, useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { addOpenedFolder, getOpenedFolders, removeOpenedFolder } from "../lib/opened-folders";

// The accountless folders the user has opened, persisted (newest-first). Auth-
// independent — a folder is a context you can work in with or without a login.
export function useOpenedFolders() {
  const [folders, setFolders] = useState<string[]>([]);

  useEffect(() => {
    void getOpenedFolders().then(setFolders);
  }, []);

  // Pick a folder via the OS dialog; returns its path so the caller can select
  // it as the active context (or null if the dialog was dismissed).
  const openFolder = useCallback(async (): Promise<string | null> => {
    const picked = await openDialog({ directory: true, multiple: false, title: "Open a folder" });
    if (typeof picked !== "string") return null;
    setFolders(await addOpenedFolder(picked));
    return picked;
  }, []);

  const closeFolder = useCallback(async (path: string) => {
    setFolders(await removeOpenedFolder(path));
  }, []);

  return { folders, openFolder, closeFolder };
}
