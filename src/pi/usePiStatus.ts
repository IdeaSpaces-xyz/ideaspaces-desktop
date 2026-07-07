import { useCallback, useEffect, useState } from "react";
import { piStatus, type PiStatus } from "../lib/cli";

// Connect Pi (C1) — detect the local pi runtime and surface its state. Detection
// is the CLI's `pi-status`; this hook just runs it and classifies the result.
export type PiConnectState =
  | { kind: "checking" }
  | { kind: "ready"; pi: PiStatus }
  | { kind: "needs-pi"; pi: PiStatus } // binary missing
  | { kind: "needs-provider"; pi: PiStatus } // binary present, no configured provider
  | { kind: "unavailable"; error: string }; // couldn't run pi-status (e.g. stale sidecar)

export function usePiStatus() {
  const [state, setState] = useState<PiConnectState>({ kind: "checking" });

  const check = useCallback(async () => {
    setState({ kind: "checking" });
    try {
      const pi = await piStatus();
      setState(
        pi.ready
          ? { kind: "ready", pi }
          : !pi.binary.present
            ? { kind: "needs-pi", pi }
            : { kind: "needs-provider", pi },
      );
    } catch (err) {
      setState({ kind: "unavailable", error: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  return { state, recheck: check };
}

// Pure — the "Connect Pi" card copy for each state. Extracted so the state→copy
// mapping is unit-testable without the sidecar.
export function describePi(state: PiConnectState): {
  title: string;
  description: string;
  connected: boolean;
} {
  switch (state.kind) {
    case "checking":
      return { title: "Connect Pi", description: "Checking for a local agent…", connected: false };
    case "ready": {
      const v = state.pi.binary.version;
      return {
        title: "Pi connected",
        description: `A local agent is ready${v ? ` · pi ${v}` : ""}.`,
        connected: true,
      };
    }
    case "needs-pi":
      return {
        title: "Connect Pi",
        description: "Install pi to enable the local agent.",
        connected: false,
      };
    case "needs-provider":
      return {
        title: "Connect Pi",
        description: "Sign in to a model provider in pi to enable the local agent.",
        connected: false,
      };
    case "unavailable":
      return {
        title: "Connect Pi",
        description: "A local agent wasn't detected.",
        connected: false,
      };
  }
}
