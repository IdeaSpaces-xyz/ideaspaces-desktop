import { useCallback, useEffect, useState } from "react";
import { login, logout, whoami } from "../lib/cli";

export type AuthStatus = "checking" | "signed-out" | "signing-in" | "signed-in";

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
    setState({ status: "signing-in" });
    try {
      await login();
      await refresh();
    } catch (err) {
      setState({ status: "signed-out", error: errMessage(err) });
    }
  }, [refresh]);

  const signOut = useCallback(async () => {
    // Clear local state regardless — logout only removes stored credentials.
    try {
      await logout();
    } catch {
      /* ignore: signing out should never strand the user signed-in */
    }
    setState({ status: "signed-out" });
  }, []);

  return { ...state, signIn, signOut } as const;
}
