import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { useToast } from "../toast/toast-context";
import { UpdaterContext, type UpdateNotice, type UpdateStatus } from "./updater-context";
import { markUpdateInstalled, takeUpdateNotice } from "./update-notice";

// One place owns the update lifecycle so both the banner and the "Check for
// updates" menu item read the same state. The plugin modules are imported
// lazily (dynamic import) so the updater code doesn't weigh down the initial
// login bundle — it loads on the first check.

export function UpdaterProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [status, setStatus] = useState<UpdateStatus>({ phase: "idle" });
  const [justUpdated, setJustUpdated] = useState<UpdateNotice | null>(null);
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

    // Phase 1: download + install. A failure here means the update did NOT land.
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
    } catch (err) {
      busyRef.current = false;
      setStatus({ phase: "error", message: err instanceof Error ? err.message : String(err) });
      return;
    }

    // Record the success before relaunch so the next launch can confirm it and
    // offer the release notes. (Best-effort — a missing marker just means no
    // "what's new" notice, not a broken update.) Set whether or not relaunch
    // succeeds: a successful relaunch shows it next boot; a failed one shows it
    // when the user restarts manually.
    try {
      await markUpdateInstalled({ version: update.version, notes: update.body ?? "" });
    } catch {
      /* notice is non-essential */
    }

    // Phase 2: relaunch into the new version. The update is already installed,
    // so if relaunch fails it's NOT an error — the user just restarts manually.
    try {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch(); // never returns on success
    } catch {
      busyRef.current = false;
      setStatus({ phase: "installed", version: update.version });
    }
  }, []);

  const checkForUpdates = useCallback(() => void runCheck(true), [runCheck]);
  const dismiss = useCallback(() => setStatus({ phase: "idle" }), []);
  const dismissJustUpdated = useCallback(() => setJustUpdated(null), []);

  // Check once on launch — production builds only (a dev build has no signed
  // manifest to compare against, so the check would only ever error).
  useEffect(() => {
    if (import.meta.env.PROD) void runCheck(false);
  }, [runCheck]);

  // Re-check when the window regains focus, so an app left open for days still
  // notices a release without a restart. Throttled to at most hourly; runCheck
  // already no-ops while a check/install is in flight (busyRef).
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    let last = Date.now();
    const onFocus = () => {
      const now = Date.now();
      if (now - last < 60 * 60 * 1000) return;
      last = now;
      void runCheck(false);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [runCheck]);

  // Did we just come up from an update? Read (and clear) the one-shot marker.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const notice = await takeUpdateNotice();
        if (alive && notice) setJustUpdated(notice);
      } catch {
        /* no store (e.g. non-Tauri context) — nothing to confirm */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <UpdaterContext.Provider
      value={{ status, justUpdated, checkForUpdates, install, dismiss, dismissJustUpdated }}
    >
      {children}
    </UpdaterContext.Provider>
  );
}
