import { useCallback, useEffect, useRef, useState } from "react";
import { login, logout, whoami } from "../lib/cli";

export type AuthStatus =
  | "checking"
  | "signed-out"
  | "signing-in"
  | "signing-out"
  | "signed-in";

export interface AuthState {
  status: AuthStatus;
  apiUrl?: string;
  error?: string;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Auth gate backed by the CLI sidecar. Checks login state on mount, drives the
 * sign-in/out flow, and re-checks via `whoami` after each transition so the CLI
 * stays the source of truth.
 */
export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: "checking" });
  // Bumped on cancel so a late-resolving sign-in can't override the reset.
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const result = await whoami();
      setState(
        result.logged_in
          ? { status: "signed-in", apiUrl: result.api_url }
          : { status: "signed-out" },
      );
    } catch (err) {
      setState({ status: "signed-out", error: errMessage(err) });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(async () => {
    const gen = ++generation.current;
    setState({ status: "signing-in" });
    try {
      await login();
    } catch (err) {
      if (gen === generation.current) {
        setState({ status: "signed-out", error: errMessage(err) });
      }
      return;
    }
    // Ignore the result if the user cancelled while the browser flow ran.
    if (gen === generation.current) await refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    setState((prev) => ({ ...prev, status: "signing-out", error: undefined }));
    try {
      await logout();
    } catch (err) {
      // Logout failed — don't claim signed-out. Reflect the CLI's real state
      // (whoami) and surface why, so the UI never diverges from the CLI.
      await refresh();
      setState((prev) => ({ ...prev, error: errMessage(err) }));
      return;
    }
    await refresh();
  }, [refresh]);

  // Abandon an in-flight sign-in (e.g. the browser flow stalled). The generation
  // guard makes the cancelled login's late result a no-op so it can't corrupt
  // state. Known v1 limitation: login uses execute() (no process handle), so the
  // orphaned CLI process and its callback server keep running until the CLI's
  // own ~120s timeout — cancelling then immediately retrying briefly runs two
  // flows. Follow-up: switch login to spawn()/kill() for true cancellation.
  const cancelSignIn = useCallback(() => {
    generation.current++;
    setState({ status: "signed-out" });
  }, []);

  return { ...state, signIn, signOut, cancelSignIn };
}
