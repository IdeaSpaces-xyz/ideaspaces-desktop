import { useCallback, useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";
import {
  addOpenedFolder,
  getOpenedFolders,
  isInsideHome,
  removeOpenedFolder,
} from "../lib/opened-folders";
import { useToast } from "../toast/toast-context";

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
