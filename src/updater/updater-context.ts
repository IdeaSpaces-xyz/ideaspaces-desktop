import { createContext, useContext } from "react";

export type UpdateStatus =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "available"; version: string; notes?: string }
  | { phase: "downloading"; version: string; pct: number | null }
  | { phase: "ready"; version: string }
  // Installed in place, but the auto-relaunch failed — the update IS done; the
  // user just needs to restart manually. Distinct from "error" (install failed).
  | { phase: "installed"; version: string }
  | { phase: "error"; message: string };

export interface UpdaterApi {
  status: UpdateStatus;
  /** Manual check — surfaces a toast on "up to date" / failure. */
  checkForUpdates: () => void;
  /** Download, verify, install the pending update, then relaunch. */
  install: () => void;
  dismiss: () => void;
}

export const UpdaterContext = createContext<UpdaterApi | null>(null);

export function useUpdater(): UpdaterApi {
  const ctx = useContext(UpdaterContext);
  if (!ctx) throw new Error("useUpdater must be used within an UpdaterProvider");
  return ctx;
}
