import { useCallback, useState } from "react";
import { join } from "@tauri-apps/api/path";
import { ask, open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { cloneSpace, forgetClone, linkClone, pullClone, pushClone, type Space } from "../lib/cli";
import { pullThenPush } from "../lib/sync";
import { defaultWorkspaceDir } from "../lib/workspace";
import { useToast } from "../toast/toast-context";

/** Clone / sync actions over the CLI sidecar, with per-row busy state + toasts. */
export function useSpaceActions(reload: () => Promise<void> | void) {
  // Set, not a single id — concurrent actions on different rows must not stomp
  // each other's busy state.
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const toast = useToast();

  const setBusy = useCallback((id: string, busy: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const errMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

  // Clone into `<parent>/<slug>` — parent defaults to the workspace dir.
  const clone = useCallback(
    async (space: Space, parentDir?: string) => {
      // The slug is the folder name appended to the parent — guard against a
      // path-traversal slug escaping the chosen directory (defense in depth;
      // the API already validates slugs).
      if (/[/\\]|\.\./.test(space.slug)) {
        toast(`Refusing to clone "${space.slug}" — unexpected characters in the name.`, "error");
        return;
      }
      setBusy(space.repo_id, true);
      try {
        const parent = parentDir ?? (await defaultWorkspaceDir());
        const target = await join(parent, space.slug);
        await cloneSpace(space.repo_id, target);
        await reload();
        toast(`Cloned ${space.slug}`);
      } catch (err) {
        toast(errMessage(err), "error");
      } finally {
        setBusy(space.repo_id, false);
      }
    },
    [reload, setBusy, toast],
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

  // Repo-first: bind a folder you already have to THIS space. The CLI verifies
  // the folder's git origin matches the space before recording the binding.
  const linkExisting = useCallback(
    async (space: Space) => {
      const picked = await open({
        directory: true,
        multiple: false,
        title: `Link a local folder to ${space.slug}…`,
      });
      if (typeof picked !== "string") return;
      setBusy(space.repo_id, true);
      try {
        await linkClone(picked, space.repo_id);
        await reload();
        toast(`Linked ${space.slug}`);
      } catch (err) {
        toast(errMessage(err), "error");
      } finally {
        setBusy(space.repo_id, false);
      }
    },
    [reload, setBusy, toast],
  );

  // Folder-first: point at any folder; the CLI auto-detects which space it is
  // from its git origin. Not tied to a row, so it has its own busy flag.
  const [linking, setLinking] = useState(false);
  const linkFolder = useCallback(async () => {
    const picked = await open({
      directory: true,
      multiple: false,
      title: "Link a folder you already have…",
    });
    if (typeof picked !== "string") return;
    setLinking(true);
    try {
      const record = await linkClone(picked);
      await reload();
      toast(`Linked ${record.slug}`);
    } catch (err) {
      toast(errMessage(err), "error");
    } finally {
      setLinking(false);
    }
  }, [reload, toast]);

  // One runner for the three directional actions (pull / push / sync-both). Each
  // op returns how many commits moved each way; the toast names the direction so
  // the user learns push vs pull, not a vague "synced".
  const runSync = useCallback(
    async (
      repoId: string,
      slug: string,
      op: () => Promise<{ integrated?: number; pushed?: number }>,
    ) => {
      setBusy(repoId, true);
      try {
        const r = await op();
        await reload();
        const parts: string[] = [];
        if (r.integrated) parts.push(`pulled ${r.integrated}`);
        if (r.pushed) parts.push(`pushed ${r.pushed}`);
        toast(parts.length ? `${slug} — ${parts.join(", ")}` : `${slug} is already up to date`);
      } catch (err) {
        toast(errMessage(err), "error");
      } finally {
        setBusy(repoId, false);
      }
    },
    [reload, setBusy, toast],
  );

  const pull = useCallback(
    (repoId: string, path: string, slug: string) =>
      runSync(repoId, slug, () => pullClone(path)),
    [runSync],
  );
  const push = useCallback(
    (repoId: string, path: string, slug: string) =>
      runSync(repoId, slug, () => pushClone(path)),
    [runSync],
  );
  const sync = useCallback(
    (repoId: string, path: string, slug: string) =>
      runSync(repoId, slug, () => pullThenPush(path)),
    [runSync],
  );

  // Show the clone's folder in the OS file manager.
  const revealInFinder = useCallback(
    async (path: string) => {
      try {
        await revealItemInDir(path);
      } catch (err) {
        toast(errMessage(err), "error");
      }
    },
    [toast],
  );

  // "Free up space" — delete the local folder (the space stays online). Destructive
  // and unconditional by design, so it's gated behind an explicit confirm that
  // names the unsynced-loss risk. The CLI still blocks a home/root catastrophe.
  const freeUpSpace = useCallback(
    async (repoId: string, path: string, slug: string) => {
      const ok = await ask(
        `Delete the local copy of "${slug}"? This removes the folder from your disk and any changes not yet synced will be lost. The space stays online — you can make it available offline again later.`,
        { title: "Free up space", kind: "warning", okLabel: "Delete", cancelLabel: "Cancel" },
      );
      if (!ok) return;
      setBusy(repoId, true);
      try {
        await forgetClone(path, true);
        await reload();
        toast(`Freed up space — ${slug} is online-only again`);
      } catch (err) {
        toast(errMessage(err), "error");
      } finally {
        setBusy(repoId, false);
      }
    },
    [reload, setBusy, toast],
  );

  return {
    busyIds,
    linking,
    clone,
    cloneTo,
    linkExisting,
    linkFolder,
    pull,
    push,
    sync,
    revealInFinder,
    freeUpSpace,
  };
}
