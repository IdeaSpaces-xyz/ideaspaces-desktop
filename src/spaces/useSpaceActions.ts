import { useCallback, useState } from "react";
import { join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { cloneSpace, syncClone, type Space } from "../lib/cli";
import { defaultWorkspaceDir } from "../lib/workspace";
import { useToast } from "../toast/toast-context";

/** Clone / sync actions over the CLI sidecar, with per-row busy state + toasts. */
export function useSpaceActions(reload: () => Promise<void> | void) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const toast = useToast();

  const errMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

  // Clone into `<parent>/<slug>` — parent defaults to the workspace dir.
  const clone = useCallback(
    async (space: Space, parentDir?: string) => {
      setBusyId(space.repo_id);
      try {
        const parent = parentDir ?? (await defaultWorkspaceDir());
        const target = await join(parent, space.slug);
        await cloneSpace(space.repo_id, target);
        await reload();
        toast(`Cloned ${space.slug}`);
      } catch (err) {
        toast(errMessage(err), "error");
      } finally {
        setBusyId(null);
      }
    },
    [reload, toast],
  );

  // Pick a parent folder, then clone there.
  const cloneTo = useCallback(
    async (space: Space) => {
      const picked = await open({
        directory: true,
        multiple: false,
        title: `Clone ${space.slug} into…`,
      });
      if (typeof picked === "string") await clone(space, picked);
    },
    [clone],
  );

  const sync = useCallback(
    async (repoId: string, path: string, slug: string) => {
      setBusyId(repoId);
      try {
        const result = await syncClone(path);
        await reload();
        toast(
          result.pushed || result.integrated
            ? `Synced ${slug} — pulled ${result.integrated}, pushed ${result.pushed}`
            : `${slug} is already up to date`,
        );
      } catch (err) {
        toast(errMessage(err), "error");
      } finally {
        setBusyId(null);
      }
    },
    [reload, toast],
  );

  return { busyId, clone, cloneTo, sync };
}
