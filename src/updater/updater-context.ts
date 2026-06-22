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

// Recorded right before relaunch so the next launch can confirm the update
// landed and offer its release notes (the Chronicle entry, from update.body).
export interface UpdateNotice {
  version: string;
  notes: string;
}

export interface UpdaterApi {
  status: UpdateStatus;
  /** Set once on launch when we've just come up from an update; cleared on read. */
  justUpdated: UpdateNotice | null;
  /** Manual check — surfaces a toast on "up to date" / failure. */
  checkForUpdates: () => void;
  /** Download, verify, install the pending update, then relaunch. */
  install: () => void;
  dismiss: () => void;
  dismissJustUpdated: () => void;
}

export const UpdaterContext = createContext<UpdaterApi | null>(null);

export function useUpdater(): UpdaterApi {
  const ctx = useContext(UpdaterContext);
  if (!ctx) throw new Error("useUpdater must be used within an UpdaterProvider");
  return ctx;
}
