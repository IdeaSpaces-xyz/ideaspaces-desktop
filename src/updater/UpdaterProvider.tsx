import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { useToast } from "../toast/toast-context";
import { UpdaterContext, type UpdateStatus } from "./updater-context";

// One place owns the update lifecycle so both the banner and the "Check for
// updates" menu item read the same state. The plugin modules are imported
// lazily (dynamic import) so the updater code doesn't weigh down the initial
// login bundle — it loads on the first check.

export function UpdaterProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [status, setStatus] = useState<UpdateStatus>({ phase: "idle" });
  const updateRef = useRef<Update | null>(null);
  // Serialize check/install so a manual click can't race the launch check.
  const busyRef = useRef(false);

  const runCheck = useCallback(
    async (manual: boolean) => {
      if (busyRef.current) return;
      busyRef.current = true;
      if (manual) setStatus({ phase: "checking" });
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (update) {
          updateRef.current = update;
          setStatus({ phase: "available", version: update.version, notes: update.body });
        } else {
          updateRef.current = null;
          setStatus({ phase: "idle" });
          if (manual) toast("You're on the latest version.");
        }
      } catch (err) {
        // Auto-check failures stay silent (offline, or a dev build with no
        // signed manifest) — only a manual check tells the user.
        setStatus({ phase: "idle" });
        if (manual) toast(`Couldn't check for updates: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        busyRef.current = false;
      }
    },
    [toast],
  );

  const install = useCallback(async () => {
    const update = updateRef.current;
    if (!update || busyRef.current) return;
    busyRef.current = true;
    try {
      let total = 0;
      let received = 0;
      setStatus({ phase: "downloading", version: update.version, pct: null });
      await update.downloadAndInstall((e) => {
        if (e.event === "Started") {
          total = e.data.contentLength ?? 0;
          received = 0;
        } else if (e.event === "Progress") {
          received += e.data.chunkLength;
          setStatus({
            phase: "downloading",
            version: update.version,
            pct: total ? received / total : null,
          });
        }
      });
      setStatus({ phase: "ready", version: update.version });
      // Installed in place — relaunch into the new version.
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (err) {
      busyRef.current = false; // relaunch never returns; only reached on failure
      setStatus({ phase: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  const checkForUpdates = useCallback(() => void runCheck(true), [runCheck]);
  const dismiss = useCallback(() => setStatus({ phase: "idle" }), []);

  // Check once on launch — production builds only (a dev build has no signed
  // manifest to compare against, so the check would only ever error).
  useEffect(() => {
    if (import.meta.env.PROD) void runCheck(false);
  }, [runCheck]);

  return (
    <UpdaterContext.Provider value={{ status, checkForUpdates, install, dismiss }}>
      {children}
    </UpdaterContext.Provider>
  );
}
