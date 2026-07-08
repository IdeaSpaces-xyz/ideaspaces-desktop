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
import { invoke } from "@tauri-apps/api/core";
import { resolveResource } from "@tauri-apps/api/path";
import type {
  KeeperConversationDetail,
  KeeperStreamEvent,
  ModelTier,
} from "../conversation/keeper-types";

// Bundled-pi wiring, resolved once at startup so the local-agent verbs are
// self-contained in a packaged app (Connect Pi D1). Empty/undefined in dev,
// where the CLI falls back to PATH `pi`, `node_modules/@ideaspaces/cli`, and
// `IDEASPACES_PI_EXTENSIONS`. See src-tauri (pi_bin_path/cli_bin_path),
// scripts/build-pi-{sidecar,extensions}.mjs, and connect-pi-d1-bundling.
let piBinArgs: string[] = []; // `--pi-bin <path>` (D1a)
let piExtArgs: string[] = []; // `--ext <dir,dir>` — bundled extension dirs (D1b)
let piSkillArgs: string[] = []; // `--skill <dir,dir>` — bundled skill dirs (D1b)
// Env for every sidecar spawn (undefined in dev): `IS_CLI_PATH` so the bundled
// pi-is-space extension shells the CLI (see cli_bin_path), and `PI_PACKAGE_DIR`
// so the bundled bun pi finds its package assets (theme/export-html/native/…) —
// without it pi ENOENTs on `theme/dark.json` at startup.
let piSidecarEnv: Record<string, string> | undefined;

// The two bundled extensions, as resource-relative dirs (see tauri.conf.json
// `resources` + build-pi-extensions.mjs). pi loads each dir's `pi.extensions`
// entry (`--ext`) and scans `<dir>/skills` for its skills (`--skill`).
const EXT_RESOURCE_DIRS = ["resources/pi-ext/pi-is-space", "resources/pi-ext/pi-local-context"];
// pi's package assets (see build-pi-sidecar.mjs) → `PI_PACKAGE_DIR`.
const PI_ASSETS_RESOURCE_DIR = "resources/pi-assets";

/** A bundled-path Rust command, bounded so a hung IPC can't blank first paint
 *  (D1a) and returning null on error (dev: not packaged next to `current_exe`). */
async function bundledPath(command: string): Promise<string | null> {
  try {
    return await Promise.race([
      invoke<string>(command),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error(`${command} timed out`)), 2000)),
    ]);
  } catch {
    return null;
  }
}

/** Resolve the bundled pi runtime once. Call at app start, before the first
 *  pi-status / local conversation. First paint is gated on this, so each step is
 *  bounded/guarded and degrades to the dev fallbacks rather than throwing.
 *  The packaged-app signal is `cli_bin_path` resolving (the CLI sidecar sits next
 *  to `current_exe` only when packaged); we gate the bundled extensions on it so
 *  dev keeps using node_modules + `IDEASPACES_PI_EXTENSIONS`. */
export async function initPiRuntime(): Promise<void> {
  // Independent, so resolve together — first paint is gated on this, and the two
  // timeouts must not stack (keep the worst-case blank-screen bound at 2s).
  const [piBin, cliBin] = await Promise.all([bundledPath("pi_bin_path"), bundledPath("cli_bin_path")]);
  piBinArgs = piBin ? ["--pi-bin", piBin] : [];
  piSidecarEnv = cliBin ? { IS_CLI_PATH: cliBin } : undefined;

  if (!cliBin) {
    // Dev: the CLI resolves via node_modules and extensions via the env var.
    piExtArgs = [];
    piSkillArgs = [];
    return;
  }
  // Packaged: hand pi the bundled extension + skill dirs, and point
  // PI_PACKAGE_DIR at pi's bundled package assets so the bundled binary starts.
  const [extResolved, assetsDir] = await Promise.all([
    Promise.all(EXT_RESOURCE_DIRS.map((rel) => resolveResource(rel).catch(() => null))),
    resolveResource(PI_ASSETS_RESOURCE_DIR).catch(() => null),
  ]);
  const dirs = extResolved.filter((d): d is string => !!d);
  piExtArgs = dirs.length ? ["--ext", dirs.join(",")] : [];
  piSkillArgs = dirs.length ? ["--skill", dirs.map((d) => `${d}/skills`).join(",")] : [];
  if (assetsDir) piSidecarEnv = { ...piSidecarEnv, PI_PACKAGE_DIR: assetsDir };
}

interface SidecarResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** The CLI sidecar command with the resolved `IS_CLI_PATH` env (D1b) applied to
 *  every spawn, so a bundled pi turn shells the bundled CLI. `env` merges with
 *  the inherited environment; it's undefined in dev (CLI via node_modules). */
function sidecar(args: string[], cwd?: string) {
  const options: { cwd?: string; env?: Record<string, string> } = {};
  if (cwd) options.cwd = cwd;
  if (piSidecarEnv) options.env = piSidecarEnv;
  return Command.sidecar("binaries/ideaspaces", args, options);
}

async function runCli(args: string[], cwd?: string): Promise<SidecarResult> {
  const out = await sidecar(args, cwd).execute();
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

export interface PullResult {
  upstream: string | null;
  /** Commits integrated from the remote. */
  integrated: number;
}

export interface PushResult {
  upstream: string | null;
  /** Commits pushed to the remote. */
  pushed: number;
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

/** Pull — integrate remote changes into a local clone (never pushes). Run in the
 *  clone's folder. Refuses on a dirty/uncommitted tree (the CLI's message). */
export async function pullClone(dir: string): Promise<PullResult> {
  const { code, stdout, stderr } = await runCli(["pull", "--json"], dir);
  if (code !== 0) {
    throw new Error(stderr.trim() || `Pull failed (exit ${code ?? "unknown"}).`);
  }
  return parseJson<PullResult>(stdout, "pull");
}

/** Push — send committed changes up (never integrates). Run in the clone's
 *  folder. Refuses when behind ("pull first") — surfaced from the CLI. */
export async function pushClone(dir: string): Promise<PushResult> {
  const { code, stdout, stderr } = await runCli(["push", "--json"], dir);
  if (code !== 0) {
    throw new Error(stderr.trim() || `Push failed (exit ${code ?? "unknown"}).`);
  }
  return parseJson<PushResult>(stdout, "push");
}

export interface ForgetResult {
  forgotten: boolean;
  /** True when `--delete` removed the folder, not just the binding. */
  deleted: boolean;
  path: string;
}

/**
 * Stop tracking a clone (drives `forget`). With `del`, also deletes the folder
 * — backs the rail's "Free up space". Deletion is unconditional (the caller
 * confirms); the CLI only blocks a home/root catastrophe.
 */
export async function forgetClone(path: string, del = false): Promise<ForgetResult> {
  const args = del ? ["forget", path, "--delete", "--json"] : ["forget", path, "--json"];
  const { code, stdout, stderr } = await runCli(args);
  if (code !== 0) {
    throw new Error(stderr.trim() || `Forget failed (exit ${code ?? "unknown"}).`);
  }
  return parseJson<ForgetResult>(stdout, "forget");
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

/**
 * Add a person to a conversation (drives `conversation add`). `actor` is a bare
 * username — the CLI builds the `person:{username}` principal. Owner-only on the
 * server; email resolution is a backend feature, so the desktop adds by username.
 */
export async function addConversationParticipant(
  repoId: string,
  conversationId: string,
  actor: string,
  role: "member" | "reader" = "member",
): Promise<void> {
  const args = ["conversation", "add", repoId, conversationId, actor, "--json"];
  if (role !== "member") args.push("--role", role);
  const { code, stderr } = await runCli(args);
  if (code !== 0) {
    throw new Error(stderr.trim() || `Could not add ${actor} (exit ${code ?? "unknown"}).`);
  }
}

/**
 * Remove a participant from a conversation (drives `conversation remove`).
 * `participant` is the full principal from the roster (`person:…` / `node:…`),
 * passed through as-is. Owner-only on the server.
 */
export async function removeConversationParticipant(
  repoId: string,
  conversationId: string,
  participant: string,
): Promise<void> {
  const { code, stderr } = await runCli([
    "conversation",
    "remove",
    repoId,
    conversationId,
    participant,
    "--json",
  ]);
  if (code !== 0) {
    throw new Error(stderr.trim() || `Could not remove participant (exit ${code ?? "unknown"}).`);
  }
}

export interface CreatedConversation {
  conversation_id: string;
  repo_id: string;
  name: string;
}

/**
 * Create a new (empty) conversation under a repo (drives `conversation new`).
 * The repo is the conversation's context — the agent's point of view — and is
 * bound here at creation (the desktop locks the context picker after this). The
 * conversation auto-names from its first turn, so no name is passed (the CLI's
 * `--name` can be wired back when a UI name field exists). `agentNodeId` picks
 * the agent: the server accepts it and honors it once backend agent-selection
 * lands (forward-compatible, like is_web).
 */
export async function createConversation(
  repoId: string,
  agentNodeId?: string,
): Promise<CreatedConversation> {
  const args = ["conversation", "new", repoId, "--json"];
  if (agentNodeId) args.push("--agent", agentNodeId);
  const { code, stdout, stderr } = await runCli(args);
  if (code !== 0) {
    throw new Error(stderr.trim() || `Could not create conversation (exit ${code ?? "unknown"}).`);
  }
  return parseJson<CreatedConversation>(stdout, "conversation new");
}

export interface Agent {
  /** Agent Actor node_id — what create/select takes. */
  node_id: string;
  name: string;
  summary: string;
  /** Whether the current user may invoke this agent. */
  can_use: boolean;
  /** Whether this is the owner's default agent. */
  is_default: boolean;
  /** Where the agent runs. `remote` = a Keeper agent from the API; `local` = the
   *  desktop-synthesized `agent:<user>-pi` running on this machine (see pi/localAgent). */
  location: "remote" | "local";
}

/**
 * List the Agent Actors the user can pick to run a conversation (drives
 * `agents`). User-scoped (`GET /api/v1/agents`) — no Space required. The CLI
 * verb takes `--owner` to scope to another context; add it back here when a
 * caller needs it.
 */
export async function listAgents(): Promise<Agent[]> {
  const { code, stdout, stderr } = await runCli(["agents", "--json"]);
  if (code !== 0) {
    throw new Error(stderr.trim() || `Could not load agents (exit ${code ?? "unknown"}).`);
  }
  // API agents are all remote (Keeper); the local Pi is synthesized client-side.
  return parseJson<{ agents: Omit<Agent, "location">[] }>(stdout, "agents").agents.map((a) => ({
    ...a,
    location: "remote" as const,
  }));
}

export interface NodeDetail {
  node_id: string;
  name: string;
  /** Display-name override from frontmatter, when present. */
  name_display?: string;
  summary?: string;
  content: string;
  path: string;
  node_type: string;
}

/**
 * Resolve a node by id (drives `node get`) — name, path, content. A
 * conversation's workspace surface is bare node-ids; this turns one into a
 * label + previewable content. Per-node (no batch endpoint yet).
 */
export async function getNode(repoId: string, nodeId: string): Promise<NodeDetail> {
  const { code, stdout, stderr } = await runCli(["node", "get", repoId, nodeId, "--json"]);
  if (code !== 0) {
    throw new Error(stderr.trim() || `Could not load node (exit ${code ?? "unknown"}).`);
  }
  return parseJson<NodeDetail>(stdout, "node get");
}

export interface NoteTimes {
  /** Repo-relative path (POSIX separators), matching NoteFile.relPath. */
  path: string;
  /** First commit that added the note — epoch ms. */
  created_at: number;
  /** Most recent commit that touched it — epoch ms. */
  updated_at: number;
}

/**
 * Per-note git created/updated times for a clone (drives the note-list date
 * sort). From git history, not the filesystem — a clone's mtime/birthtime are
 * all the checkout moment. Run with the clone as cwd.
 */
export async function noteTimes(clonePath: string): Promise<NoteTimes[]> {
  const { code, stdout, stderr } = await runCli(["times", "--json"], clonePath);
  if (code !== 0) {
    throw new Error(stderr.trim() || `Could not read note times (exit ${code ?? "unknown"}).`);
  }
  return parseJson<{ files: NoteTimes[] }>(stdout, "times").files;
}

/**
 * Write a note's content on the server (drives `node put`) — the conversation
 * preview's online edit. No clone needed, so online-only notes are editable;
 * 403 (no write access) surfaces as a friendly read-only message.
 */
export async function putNode(repoId: string, path: string, content: string): Promise<void> {
  const { code, stderr } = await runCli(["node", "put", repoId, path, "--content", content]);
  if (code !== 0) {
    const msg = stderr.trim();
    if (/\b403\b|forbidden|permission|access/i.test(msg)) {
      throw new Error("You don't have write access to this repo.");
    }
    throw new Error(msg || `Could not save note (exit ${code ?? "unknown"}).`);
  }
}

// ── Sharing (drives the `share` verbs) ────────────────────────────────────────
export type InviteRole = "MEMBER" | "CLONER" | "READER";
export type MemberRole = "OWNER" | InviteRole;
export type CopyAccessLevel = "owner" | "member" | "reader" | "public";

export interface Member {
  user_id: number;
  username: string | null;
  email: string | null;
  role: MemberRole;
}
export interface PendingInvite {
  invite_id: string;
  invited_email: string;
  role: InviteRole;
}
export interface InviteResult {
  email: string;
  status: string;
  reason?: string;
}
export interface SpaceAccess {
  root_node_id: string;
  read_public: boolean;
  copy_access: CopyAccessLevel;
}

// Owner-gated verbs surface a 403 as a plain "owner only" message.
function shareError(stderr: string, code: number | null, verb: string): Error {
  const msg = stderr.trim();
  if (/\b403\b|forbidden|permission/i.test(msg)) {
    return new Error("Only the repo owner can manage sharing.");
  }
  return new Error(msg || `${verb} failed (exit ${code ?? "unknown"}).`);
}

export async function shareAccess(repoId: string): Promise<SpaceAccess> {
  const { code, stdout, stderr } = await runCli(["share", "access", repoId, "--json"]);
  if (code !== 0) throw shareError(stderr, code, "share access");
  return parseJson<SpaceAccess>(stdout, "share access");
}

export async function shareSetAccess(
  repoId: string,
  readPublic: boolean,
  copy: CopyAccessLevel,
): Promise<SpaceAccess> {
  const args = ["share", "set-access", repoId, "--public", String(readPublic), "--copy", copy, "--json"];
  const { code, stdout, stderr } = await runCli(args);
  if (code !== 0) throw shareError(stderr, code, "share set-access");
  return parseJson<SpaceAccess>(stdout, "share set-access");
}

export async function shareMembers(repoId: string): Promise<Member[]> {
  const { code, stdout, stderr } = await runCli(["share", "members", repoId, "--json"]);
  if (code !== 0) throw shareError(stderr, code, "share members");
  return parseJson<{ members: Member[] }>(stdout, "share members").members;
}

export async function shareRemoveMember(repoId: string, userId: number): Promise<void> {
  const { code, stderr } = await runCli(["share", "remove", repoId, String(userId), "--json"]);
  if (code !== 0) throw shareError(stderr, code, "share remove");
}

export async function shareInvites(repoId: string): Promise<PendingInvite[]> {
  const { code, stdout, stderr } = await runCli(["share", "invites", repoId, "--json"]);
  if (code !== 0) throw shareError(stderr, code, "share invites");
  return parseJson<{ invites: PendingInvite[] }>(stdout, "share invites").invites;
}

export async function shareInvite(
  repoId: string,
  emails: string[],
  role: InviteRole,
): Promise<InviteResult[]> {
  const args = ["share", "invite", repoId, ...emails, "--role", role, "--json"];
  const { code, stdout, stderr } = await runCli(args);
  if (code !== 0) throw shareError(stderr, code, "share invite");
  return parseJson<{ results: InviteResult[] }>(stdout, "share invite").results;
}

export async function shareRevoke(repoId: string, inviteId: string): Promise<void> {
  const { code, stderr } = await runCli(["share", "revoke", repoId, inviteId, "--json"]);
  if (code !== 0) throw shareError(stderr, code, "share revoke");
}

export interface SearchHit {
  /** Repo-relative path — what the editor opens on click. */
  path: string;
  score: number;
  body_hits: number;
  name_hits: number;
  snippet: string;
  /** 1-based line of the snippet, or null for a filename-only match. */
  line: number | null;
}

export interface SearchResponse {
  query: string;
  scanned: number;
  total: number;
  results: SearchHit[];
}

/**
 * Local, repo-level search over one clone's Markdown (drives `search`). Runs
 * entirely on disk in the clone — no network. The query goes after `--` so it
 * is always a positional, even if it begins with a dash.
 */
export async function searchRepo(
  clonePath: string,
  query: string,
  limit = 10,
): Promise<SearchResponse> {
  const { code, stdout, stderr } = await runCli(
    ["search", "--limit", String(limit), "--json", "--", query],
    clonePath,
  );
  if (code !== 0) {
    throw new Error(stderr.trim() || `Search failed (exit ${code ?? "unknown"}).`);
  }
  return parseJson<SearchResponse>(stdout, "search");
}

/** Full conversation detail + message history (drives `conversation get`). */
export async function getConversation(
  repoId: string,
  conversationId: string,
): Promise<KeeperConversationDetail> {
  const { code, stdout, stderr } = await runCli([
    "conversation",
    "get",
    repoId,
    conversationId,
    "--json",
  ]);
  if (code !== 0) {
    throw new Error(stderr.trim() || `Could not load conversation (exit ${code ?? "unknown"}).`);
  }
  return parseJson<KeeperConversationDetail>(stdout, "conversation get");
}

export interface SendMessage {
  message: string;
  modelTier?: ModelTier;
  thinking?: boolean;
}

export interface StreamHandlers {
  /** Each parsed stream event, in order. */
  onEvent: (event: KeeperStreamEvent) => void;
}

export interface StreamHandle {
  /** Resolves on a clean turn (or cancel); rejects on a stream failure. */
  done: Promise<void>;
  /**
   * Stop the turn. Kills the sidecar, which on SIGTERM also tells the server to
   * cancel the active turn (the turn runs server-side past disconnect, so the
   * kill alone wouldn't stop it).
   */
  cancel: () => Promise<void>;
}

/**
 * Stream a Keeper turn (drives `conversation send`). The CLI POSTs the SSE
 * endpoint and re-emits each event as one JSON object per line on stdout; we
 * line-buffer that (a `data` event can carry a partial or multiple lines) and
 * parse each line into a {@link KeeperStreamEvent}. Spawned (not execute()'d) so
 * the turn can be cancelled mid-flight.
 */
export function streamConversation(
  repoId: string,
  conversationId: string,
  body: SendMessage,
  handlers: StreamHandlers,
): StreamHandle {
  // The message rides as a single `--message` argv. OS arg limits cap this
  // (~256 KB total on macOS, ~2 MB on Linux); long pasted content could hit it,
  // so PR B validates length before streaming. A stdin path is the fix if it bites.
  const args = ["conversation", "send", repoId, conversationId, "--message", body.message];
  if (body.modelTier) args.push("--model", body.modelTier);
  if (body.thinking) args.push("--thinking");
  args.push("--json");
  return streamCli(args, handlers);
}

/**
 * Stream a LOCAL (Pi) turn over a folder — `conversation send --local`. Same
 * event contract as {@link streamConversation} (the CLI emits the same 9 Keeper
 * events), so the reducer + transcript are reused unchanged. `context` is the
 * folder root; sessions live at `<context>/.pi/sessions/`. Extensions + skills
 * come from the bundle (`--ext`/`--skill`, resolved by {@link initPiRuntime}); in
 * dev those are empty and the CLI falls back to `IDEASPACES_PI_EXTENSIONS`. No
 * repo_id, no account: Pi runs standalone over the local path.
 */
export function streamLocalConversation(
  context: string,
  conversationId: string,
  body: SendMessage,
  handlers: StreamHandlers,
): StreamHandle {
  const args = [
    "conversation",
    "send",
    "--local",
    "--context",
    context,
    "--conversation",
    conversationId,
    "--message",
    body.message,
    "--json",
    ...piExtArgs,
    ...piSkillArgs,
    ...piBinArgs,
  ];
  return streamCli(args, handlers);
}

/** Shared streaming core: spawn the sidecar with `args`, line-buffer stdout into
 *  {@link KeeperStreamEvent}s, expose done/cancel. Spawned (not execute()'d) so a
 *  turn can be cancelled mid-flight. */
function streamCli(args: string[], handlers: StreamHandlers): StreamHandle {
  const command = sidecar(args);

  let buffer = "";
  let stderr = "";

  const emitLine = (raw: string) => {
    const line = raw.trim();
    if (!line) return;
    try {
      handlers.onEvent(JSON.parse(line) as KeeperStreamEvent);
    } catch {
      // The CLI emits only JSON event lines on stdout, so a non-JSON line is
      // unexpected (e.g. a Node deprecation notice). Surface it for devtools
      // rather than dropping it silently — a silent swallow looks like a hang.
      console.warn("[keeper stream] ignoring non-JSON stdout line:", line);
    }
  };

  command.stdout.on("data", (chunk) => {
    buffer += chunk;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      emitLine(line);
    }
  });
  command.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  let child: Child | null = null;
  let cancelled = false;

  const done = new Promise<void>((resolve, reject) => {
    command.on("error", (err) => reject(new Error(String(err))));
    command.on("close", ({ code }) => {
      if (buffer.trim()) emitLine(buffer); // flush a final line with no trailing \n
      buffer = "";
      if (cancelled || code === 0) resolve();
      else reject(new Error(stderr.trim() || `Conversation stream failed (exit ${code ?? "unknown"}).`));
    });
    command
      .spawn()
      .then((spawned) => {
        child = spawned;
        // Cancelled before spawn resolved — kill now; ignore a kill error (the
        // close event still fires and resolves via the `cancelled` flag).
        if (cancelled) void spawned.kill().catch(() => {});
      })
      .catch(reject);
  });

  const cancel = async () => {
    cancelled = true;
    if (child) await child.kill();
  };

  return { done, cancel };
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
  const command = sidecar(["login", "--json"]);
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

// --- Connect Pi (local agent detection) ---
// Mirrors the CLI `pi-status` contract (commands/pi-status.ts). Detection lives
// in the CLI so the desktop never parses ~/.pi; we just render this.

export interface PiProvider {
  name: string;
  hasCreds: boolean;
  expiresAt: number | null;
  expired: boolean;
}

export interface PiExtensionCheck {
  name: string;
  path: string;
  resolvable: boolean;
}

export interface PiBinary {
  present: boolean;
  path: string;
  version: string | null;
}

export interface PiStatus {
  binary: PiBinary;
  providers: PiProvider[];
  /** ≥1 provider carries credentials (expired-but-refreshable still counts). */
  configured: boolean;
  extensions: PiExtensionCheck[];
  extensionsResolvable: boolean;
  /** The C1 "Connect Pi" bar: a usable binary + a configured provider. */
  ready: boolean;
}

/**
 * Is the local pi runtime usable for a local agent? Runs `pi-status --json`.
 * With extension paths (explicit, or the bundled dirs resolved by
 * {@link initPiRuntime}) it also reports `extensionsResolvable` — so in a
 * packaged app the C1 check verifies the bundle; in dev it's binary+config only.
 */
export async function piStatus(extPaths?: string[]): Promise<PiStatus> {
  const args = ["pi-status", "--json"];
  if (extPaths && extPaths.length) args.push("--ext", extPaths.join(","));
  else args.push(...piExtArgs);
  args.push(...piBinArgs);
  const { code, stdout, stderr } = await runCli(args);
  if (code !== 0) {
    throw new Error(stderr.trim() || `Could not check pi status (exit ${code ?? "unknown"}).`);
  }
  return parseJson<PiStatus>(stdout, "pi-status");
}

// --- Local (Pi) conversations ---
// Pi runs standalone over a folder path (no repo_id, no account). Same JSON
// contracts as the remote conversation verbs, so the reducer + transcript reuse.

/** Create a local conversation — `conversation new --local`. Mints an id (the pi
 *  session id); the session file is created lazily on first send. */
export async function createLocalConversation(): Promise<{ conversation_id: string }> {
  const { code, stdout, stderr } = await runCli([
    "conversation",
    "new",
    "--local",
    "--json",
    ...piBinArgs,
  ]);
  if (code !== 0) {
    throw new Error(stderr.trim() || `Could not create a local conversation (exit ${code ?? "unknown"}).`);
  }
  return parseJson<{ conversation_id: string }>(stdout, "conversation new --local");
}

/** Read a local conversation's history — `conversation get --local`. Same shape
 *  as the remote get; `repo_id` in the payload is the context root, not a repo. */
export async function getLocalConversation(
  context: string,
  conversationId: string,
): Promise<KeeperConversationDetail> {
  const { code, stdout, stderr } = await runCli([
    "conversation",
    "get",
    "--local",
    "--context",
    context,
    "--conversation",
    conversationId,
    "--json",
    ...piBinArgs,
  ]);
  if (code !== 0) {
    throw new Error(stderr.trim() || `Could not load the local conversation (exit ${code ?? "unknown"}).`);
  }
  return parseJson<KeeperConversationDetail>(stdout, "conversation get --local");
}

export interface LocalConversationsResult {
  context: string;
  conversations: Conversation[];
  total: number;
  has_more: boolean;
}

/** List a folder's local conversations — `conversations --local --context <root>`. */
export async function listLocalConversations(context: string): Promise<LocalConversationsResult> {
  const { code, stdout, stderr } = await runCli([
    "conversations",
    "--local",
    "--context",
    context,
    "--json",
    ...piBinArgs,
  ]);
  if (code !== 0) {
    throw new Error(stderr.trim() || `Could not load local conversations (exit ${code ?? "unknown"}).`);
  }
  return parseJson<LocalConversationsResult>(stdout, "conversations --local");
}
