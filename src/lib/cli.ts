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

async function runCli(args: string[], cwd?: string): Promise<SidecarResult> {
  const out = await Command.sidecar("binaries/ideaspaces", args, cwd ? { cwd } : undefined).execute();
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

export interface CloneRecord {
  path: string;
  repo_id: string;
  slug: string;
  namespace: string;
}

/** Local clone registry — which folders are bound to which spaces. */
export async function listClones(): Promise<CloneRecord[]> {
  const { code, stdout, stderr } = await runCli(["clones", "--json"]);
  if (code !== 0) {
    throw new Error(stderr.trim() || `Could not load clones (exit ${code ?? "unknown"}).`);
  }
  return parseJson<{ clones: CloneRecord[] }>(stdout, "clones").clones;
}

/** Clone a space into `dir` and bind it (drives `ideaspaces clone`). */
export async function cloneSpace(repoId: string, dir: string): Promise<CloneRecord> {
  const { code, stdout, stderr } = await runCli(["clone", repoId, dir, "--json"]);
  if (code !== 0) {
    throw new Error(stderr.trim() || `Clone failed (exit ${code ?? "unknown"}).`);
  }
  return parseJson<CloneRecord>(stdout, "clone");
}

/**
 * Bind an existing local clone to a space (no re-clone). With `repoId`, the CLI
 * verifies the folder's git origin matches that space; without it, the origin
 * is auto-matched against the user's spaces. Returns the same record as clone.
 */
export async function linkClone(dir: string, repoId?: string): Promise<CloneRecord> {
  const args = repoId ? ["link", dir, repoId, "--json"] : ["link", dir, "--json"];
  const { code, stdout, stderr } = await runCli(args);
  if (code !== 0) {
    throw new Error(stderr.trim() || `Link failed (exit ${code ?? "unknown"}).`);
  }
  return parseJson<CloneRecord>(stdout, "link");
}

export interface CloneStatus {
  branch: string | null;
  /** null when no upstream is configured. */
  ahead: number | null;
  behind: number | null;
  dirty: boolean;
}

/**
 * Git status of a local clone (drives `ideaspaces status`). `fetch: true` adds
 * `--fetch` to refresh ahead/behind against the real remote (network).
 */
export async function cloneStatus(dir: string, fetch = false): Promise<CloneStatus> {
  const args = fetch ? ["status", "--fetch", "--json"] : ["status", "--json"];
  const { code, stdout, stderr } = await runCli(args, dir);
  if (code !== 0) {
    throw new Error(stderr.trim() || `Status failed (exit ${code ?? "unknown"}).`);
  }
  return parseJson<CloneStatus>(stdout, "status");
}

export interface SyncResult {
  upstream: string | null;
  /** Commits pushed to the remote. */
  pushed: number;
  /** Commits integrated from the remote. */
  integrated: number;
}

export interface CommitResult {
  commit_sha: string;
  committed_paths: string[];
}

/**
 * Commit named note paths in a clone (drives `ideaspaces commit -m`). Paths are
 * relative to the clone root and run with the clone as cwd. Commits the working
 * tree of those tracked paths — the editor saves to disk first, then commits.
 * `sync` only pushes committed history, so this is the bridge between a local
 * save and a push.
 */
export async function commitClone(
  dir: string,
  message: string,
  relPaths: string[],
): Promise<CommitResult> {
  // Paths come from readDir, but a file literally named `--force` would land as
  // a CLI flag once spread into argv. Refuse leading-dash paths defensively.
  if (relPaths.some((p) => p.startsWith("-"))) {
    throw new Error("Refusing to commit a path that looks like a flag.");
  }
  const { code, stdout, stderr } = await runCli(
    ["commit", "-m", message, ...relPaths, "--json"],
    dir,
  );
  if (code !== 0) {
    throw new Error(stderr.trim() || `Commit failed (exit ${code ?? "unknown"}).`);
  }
  return parseJson<CommitResult>(stdout, "commit");
}

/** Sync a local clone — fetch/rebase/push, run in the clone's folder. */
export async function syncClone(dir: string): Promise<SyncResult> {
  const { code, stdout, stderr } = await runCli(["sync", "--json"], dir);
  if (code !== 0) {
    throw new Error(stderr.trim() || `Sync failed (exit ${code ?? "unknown"}).`);
  }
  return parseJson<SyncResult>(stdout, "sync");
}

export interface Conversation {
  conversation_id: string;
  name: string;
  summary: string;
  message_count: number;
  status: string;
  updated_at: string;
}

export interface ConversationsResult {
  repo_id: string;
  conversations: Conversation[];
  total: number;
  has_more: boolean;
}

/** List a repo's conversations (drives `ideaspaces conversations`). */
export async function listConversations(repoId: string): Promise<ConversationsResult> {
  const { code, stdout, stderr } = await runCli(["conversations", repoId, "--json"]);
  if (code !== 0) {
    throw new Error(stderr.trim() || `Could not load conversations (exit ${code ?? "unknown"}).`);
  }
  return parseJson<ConversationsResult>(stdout, "conversations");
}

export type ParticipantRole = "owner" | "member" | "reader";

export interface Participant {
  id: string | null;
  process_node_id: string;
  /** Canonical principal: `person:{username}` / `agent:{node}` / `node:{id}`. */
  participant: string;
  role: ParticipantRole;
  joined_at: string | null;
  joined_via: string | null;
  revoked_at: string | null;
}

/**
 * A conversation's roster — its active participants (drives `ideaspaces
 * conversation participants`). Membership is conversation-keyed on the server,
 * so this works on any conversation without a Space. The owner is synthesized
 * (role "owner"); revoked rows are excluded.
 */
export async function listConversationParticipants(
  repoId: string,
  conversationId: string,
): Promise<Participant[]> {
  const { code, stdout, stderr } = await runCli([
    "conversation",
    "participants",
    repoId,
    conversationId,
    "--json",
  ]);
  if (code !== 0) {
    throw new Error(stderr.trim() || `Could not load participants (exit ${code ?? "unknown"}).`);
  }
  return parseJson<{ participants: Participant[] }>(stdout, "conversation participants").participants;
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
