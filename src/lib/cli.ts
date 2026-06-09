// Typed wrapper over the bundled @ideaspaces/cli sidecar.
//
// The CLI owns auth/git/sync; the desktop drives it through these verbs.
// The capability (src-tauri/capabilities/default.json) scopes execution to this
// one sidecar binary with `args: true`, and verbs are passed per call here.
//
// Per-command arg allow-lists do NOT work: Tauri runs a sidecar with the matched
// scope entry's args, not the call's, so multiple fixed-arg entries for one
// binary all resolve to the first (verified — `logout` silently ran `whoami` and
// never cleared credentials). Scoping the binary and passing args at the call
// site is the working, idiomatic pattern. Execution is still limited to our CLI
// (no arbitrary programs); the webview is first-party with CSP set.

import { Command, type Child } from "@tauri-apps/plugin-shell";

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

export interface Space {
  repo_id: string;
  slug: string;
  hostname: string | null;
  role: string;
  member_count: number;
}

export interface SpacesResult {
  username: string | null;
  repos: Space[];
}

/** List the signed-in user's spaces (drives `ideaspaces repos`). */
export async function listSpaces(): Promise<SpacesResult> {
  const { code, stdout, stderr } = await runCli(["repos", "--json"]);
  if (code !== 0) {
    throw new Error(stderr.trim() || `Could not load spaces (exit ${code ?? "unknown"}).`);
  }
  return parseJson<SpacesResult>(stdout, "repos");
}

export interface LoginHandle {
  /** Resolves when login completes or is cancelled; rejects on failure. */
  done: Promise<void>;
  /** Kill the login process, closing the OAuth callback server. */
  cancel: () => Promise<void>;
}

/**
 * Start the OAuth login flow. The CLI opens the browser and runs a local
 * callback server. Spawned (not execute()'d) so it can be cancelled: `cancel()`
 * kills the process and its callback server. Await `done` for completion; the
 * resulting state is read back via whoami(), so login output isn't returned.
 */
export function login(): LoginHandle {
  const command = Command.sidecar("binaries/ideaspaces", ["login", "--json"]);
  let stderr = "";
  command.stderr.on("data", (line) => {
    stderr += line;
  });

  let child: Child | null = null;
  let cancelled = false;

  const done = new Promise<void>((resolve, reject) => {
    command.on("error", (err) => reject(new Error(String(err))));
    command.on("close", ({ code }) => {
      if (cancelled || code === 0) resolve();
      else reject(new Error(stderr.trim() || `Sign-in failed (exit ${code ?? "unknown"}).`));
    });
    command
      .spawn()
      .then((spawned) => {
        child = spawned;
        // Cancelled before spawn resolved — kill immediately.
        if (cancelled) void spawned.kill();
      })
      .catch(reject);
  });

  const cancel = async () => {
    cancelled = true;
    if (child) await child.kill();
  };

  return { done, cancel };
}

/** Clear stored credentials. */
export async function logout(): Promise<void> {
  const { code, stderr } = await runCli(["power", "logout", "--json"]);
  if (code !== 0) {
    throw new Error(stderr.trim() || `Sign-out failed (exit ${code ?? "unknown"}).`);
  }
}
