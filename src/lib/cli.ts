// Typed wrapper over the bundled @ideaspaces/cli sidecar.
//
// The CLI owns auth/git/sync; the desktop drives it through these verbs. Each
// command here must have a matching scoped entry in
// src-tauri/capabilities/default.json — the arg vectors are an allow-list.

import { Command } from "@tauri-apps/plugin-shell";

interface SidecarResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

async function runCli(args: string[]): Promise<SidecarResult> {
  const out = await Command.sidecar("binaries/ideaspaces", args).execute();
  return { code: out.code, stdout: out.stdout, stderr: out.stderr };
}

function parseJson<T>(stdout: string, command: string): T {
  try {
    return JSON.parse(stdout.trim()) as T;
  } catch {
    throw new Error(`${command}: unexpected output: ${stdout.trim() || "(empty)"}`);
  }
}

export interface WhoamiResult {
  logged_in: boolean;
  api_url?: string;
}

/** Query login state. Always exits 0; returns whether credentials are present. */
export async function whoami(): Promise<WhoamiResult> {
  const { stdout } = await runCli(["whoami", "--json"]);
  return parseJson<WhoamiResult>(stdout, "whoami");
}

/**
 * Run the OAuth login flow. The CLI opens the browser and runs a local
 * callback server; this resolves when the CLI process completes (or rejects
 * on non-zero exit, e.g. the CLI's ~120s callback timeout). The resulting
 * state is read back via whoami(), so the login output itself isn't returned.
 */
export async function login(): Promise<void> {
  const { code, stderr } = await runCli(["login", "--json"]);
  if (code !== 0) {
    throw new Error(stderr.trim() || `Sign-in failed (exit ${code ?? "unknown"}).`);
  }
}

/** Clear stored credentials. */
export async function logout(): Promise<void> {
  const { code, stderr } = await runCli(["power", "logout", "--json"]);
  if (code !== 0) {
    throw new Error(stderr.trim() || `Sign-out failed (exit ${code ?? "unknown"}).`);
  }
}
