import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Bot, Cloud, FolderOpen, type LucideIcon } from "lucide-react";
import { ContextSwitcher } from "./components/ContextSwitcher";
import { Header } from "./components/Header";
import { LogoSymbol } from "./components/LogoSymbol";
import { RepoRail } from "./components/RepoRail";
import { ThemeToggle } from "./components/ThemeToggle";
import { UpdateBanner } from "./updater/UpdateBanner";
import { UpdatedNotice } from "./updater/UpdatedNotice";
import { SearchPalette } from "./search/SearchPalette";
import type { RankedHit, SearchTarget } from "./search/useRepoSearch";
import { useAuth } from "./auth/useAuth";
import { useSpaces } from "./spaces/useSpaces";
import { useSpaceActions } from "./spaces/useSpaceActions";
import { useCloneStatuses } from "./spaces/useCloneStatuses";
import { useOpenedFolders } from "./spaces/useOpenedFolders";
import { useTheme, type ThemeMode } from "./theme/useTheme";
import {
  deriveSpaceContexts,
  folderContext,
  resolveContext,
  spacesForContext,
  type SpaceContext,
} from "./lib/space-context";
import { deriveRepoEntries } from "./lib/repo-entry";
import { getActiveContextRef, setActiveContextRef } from "./lib/active-context";
import { fromClone, type Location } from "./lib/location";

// Props shared across the shell views — context selection lives above the
// signed-in/out split so a folder can be opened and worked in either state.
interface ShellContextProps {
  activeRef: string | undefined;
  onSelectContext: (ref: string) => void;
  folderContexts: SpaceContext[];
  onOpenFolder: () => void;
  onCloseFolder: (ctx: SpaceContext) => void;
  /** Leave the active folder context (the editor's Back at the folder root). */
  onLeaveFolder: () => void;
}

// Code-split: CodeMirror + the live-preview layer load only when a note opens,
// keeping the initial bundle (login/browse) light.
const EditorSurface = lazy(() =>
  import("./components/EditorSurface").then((m) => ({ default: m.EditorSurface })),
);

// Code-split: the chat transcript pulls in react-markdown — load it only when
// the Conversations view opens, keeping the login/browse bundle light.
const ConversationsView = lazy(() =>
  import("./components/ConversationsView").then((m) => ({ default: m.ConversationsView })),
);

type Auth = ReturnType<typeof useAuth>;

const primaryButton =
  "rounded-lg bg-is-text px-5 py-2.5 text-sm font-medium text-is-bg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

function SignedInView({
  auth,
  mode,
  setMode,
  activeRef,
  onSelectContext,
  folderContexts,
  onOpenFolder,
  onCloseFolder,
  onLeaveFolder,
}: {
  auth: Auth;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
} & ShellContextProps) {
  const spaces = useSpaces();
  const actions = useSpaceActions(spaces.reload);
  // The open editor: a clone, optionally jumped to a specific note (from search).
  const [editing, setEditing] = useState<{ location: Location; note?: string } | undefined>(
    undefined,
  );
  // Repo to preselect in the home composer — set when "Start conversation" is
  // hit from inside a repo's tree, so the draft opens already scoped to it.
  const [convoRepoId, setConvoRepoId] = useState<string | undefined>(undefined);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // A pending preselect belongs to the old context — clear it on a switch.
  useEffect(() => {
    setConvoRepoId(undefined);
  }, [activeRef]);

  // Account contexts (Personal/org) plus the accountless folders from above.
  const accountContexts = useMemo(
    () => deriveSpaceContexts(spaces.username, spaces.spaces),
    [spaces.username, spaces.spaces],
  );
  const contexts = useMemo(
    () => [...accountContexts, ...folderContexts],
    [accountContexts, folderContexts],
  );
  const activeContext = resolveContext(contexts, activeRef);
  const isFolder = activeContext?.kind === "folder";
  const visibleSpaces = useMemo(
    () =>
      activeContext && !isFolder ? spacesForContext(spaces.spaces, activeContext) : spaces.spaces,
    [activeContext, isFolder, spaces.spaces],
  );
  const cloneStatuses = useCloneStatuses(spaces.clones);
  const repoEntries = useMemo(
    () =>
      deriveRepoEntries({
        visibleSpaces,
        allSpaces: spaces.spaces,
        clones: spaces.clones,
        statuses: cloneStatuses.statuses,
        failed: cloneStatuses.failed,
      }),
    [visibleSpaces, spaces.spaces, spaces.clones, cloneStatuses.statuses, cloneStatuses.failed],
  );

  // Search targets: every available-offline repo in the active context. Online-
  // only repos aren't on disk to search — counted so the palette can say so.
  const searchTargets = useMemo<SearchTarget[]>(
    () =>
      repoEntries.inContext
        .filter((e) => e.location !== "online-only" && e.clone)
        .map((e) => ({ repoId: e.repoId, slug: e.slug, clonePath: e.clone!.path })),
    [repoEntries.inContext],
  );
  const onlineOnlyCount = useMemo(
    () => repoEntries.inContext.filter((e) => e.location === "online-only").length,
    [repoEntries.inContext],
  );

  // ⌘K / Ctrl-K toggles the search palette from anywhere (home or editor).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openHit = useCallback(
    (hit: RankedHit) => {
      const clone = spaces.clones.find((c) => c.path === hit.clonePath);
      if (clone) {
        const space = spaces.spaces.find((s) => s.repo_id === clone.repo_id);
        setEditing({ location: fromClone(clone, space), note: hit.path });
      }
      setPaletteOpen(false);
    },
    [spaces.clones, spaces.spaces],
  );

  return (
    // Fixed viewport height + overflow-hidden so inner panes (the repos list,
    // and the editor's tree vs. preview) each own their scroll instead of the
    // whole window growing and scrolling as one.
    <div className="flex h-dvh flex-col overflow-hidden">
      <Header
        contexts={contexts}
        activeContext={activeContext}
        onSelectContext={onSelectContext}
        onOpenFolder={onOpenFolder}
        onCloseFolder={onCloseFolder}
        onHome={() => setEditing(undefined)}
        username={spaces.username ?? undefined}
        mode={mode}
        setMode={setMode}
        onSignOut={auth.signOut}
        signingOut={auth.status === "signing-out"}
      />
      {isFolder ? (
        <FolderEditor context={activeContext!} onLeave={onLeaveFolder} />
      ) : editing ? (
        <Suspense
          fallback={<div className="flex flex-1 items-center justify-center text-sm text-is-text-tertiary">Loading editor…</div>}
        >
          <EditorSurface
            key={`${editing.location.path}::${editing.note ?? ""}`}
            location={editing.location}
            initialRelPath={editing.note}
            onClose={() => setEditing(undefined)}
            onStartConversation={() => {
              setConvoRepoId(editing.location.remote?.repo_id);
              setEditing(undefined);
            }}
            canShare={
              spaces.spaces
                .find((s) => s.repo_id === editing.location.remote?.repo_id)
                ?.role?.toLowerCase() === "owner"
            }
          />
        </Suspense>
      ) : (
        // Home: repos in the left rail (context-scoped), conversations as the
        // main surface. Clicking a repo opens the editor (above).
        <div className="flex min-h-0 flex-1">
          <RepoRail
            entries={repoEntries}
            busyIds={actions.busyIds}
            status={spaces.status}
            error={spaces.error}
            onReload={() => void spaces.reload()}
            onOpen={(entry) => entry.clone && setEditing({ location: fromClone(entry.clone, entry.space) })}
            onClone={actions.clone}
            onCloneTo={actions.cloneTo}
            onLinkExisting={actions.linkExisting}
            onPull={actions.pull}
            onPush={actions.push}
            onSync={actions.sync}
            onReveal={actions.revealInFinder}
            onFreeUpSpace={actions.freeUpSpace}
            onLinkFolder={actions.linkFolder}
            linking={actions.linking}
            onRefresh={() => void cloneStatuses.refresh()}
            refreshing={cloneStatuses.refreshing}
          />
          <main className="min-h-0 flex-1 overflow-y-auto">
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-sm text-is-text-tertiary">
                  Loading conversations…
                </div>
              }
            >
              <ConversationsView
                repos={visibleSpaces}
                reposLoading={spaces.status !== "loaded"}
                username={spaces.username ?? "you"}
                preselectRepoId={convoRepoId}
              />
            </Suspense>
          </main>
        </div>
      )}
      {paletteOpen && (
        <SearchPalette
          targets={searchTargets}
          onlineOnlyCount={onlineOnlyCount}
          onOpen={openHit}
          onClose={() => setPaletteOpen(false)}
        />
      )}
      {auth.error && (
        <p className="fixed bottom-3 left-3 z-20 rounded-md border border-is-border bg-is-surface px-3 py-2 text-xs text-is-danger-text shadow-md">
          {auth.error}
        </p>
      )}
    </div>
  );
}

// The body for an accountless folder context — the editor over the folder. The
// editor is already path-native (Tauri `fs`); a folder Location has no `remote`,
// so Share / web-link / Sync / Discuss stay hidden (S2c-1). The Back button at
// the folder root leaves the context (`onLeave`).
function FolderEditor({ context, onLeave }: { context: SpaceContext; onLeave: () => void }) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center text-sm text-is-text-tertiary">
          Loading editor…
        </div>
      }
    >
      <EditorSurface
        key={context.path}
        location={{ path: context.path! }}
        onClose={onLeave}
        onStartConversation={() => {}}
        canShare={false}
      />
    </Suspense>
  );
}

// One of the three connectors on the signed-out empty state. A card with an
// icon, a title, and a description; `disabled` dims it and shows a "Soon" tag
// (Connect Pi ships in S4 — shown now so the three-layer shape reads at a
// glance). With `onClick` the whole card is a button.
function ConnectCard({
  icon: Icon,
  title,
  description,
  disabled,
  onClick,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  disabled?: boolean;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const cls = `w-full rounded-xl border border-is-border bg-is-surface p-4 text-left${
    disabled ? " opacity-60" : ""
  }${onClick ? " transition hover:bg-is-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring" : ""}`;
  const inner = (
    <div className="flex items-start gap-3">
      <Icon size={20} strokeWidth={1.333} className="mt-0.5 shrink-0 text-is-text-tertiary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="font-chrome text-sm text-is-text">{title}</h2>
          {disabled && (
            <span className="rounded-full border border-is-border px-1.5 py-0.5 font-chrome text-[10px] uppercase tracking-wide text-is-text-tertiary">
              Soon
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-is-text-secondary">{description}</p>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </div>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

// The signed-out empty state: the three connectors (IdeaSpace live; Open folder
// and Connect Pi shown as coming soon). The sign-in flow (button label, cancel,
// error) lives in the IdeaSpace card.
function ConnectPanel({
  auth,
  onOpenFolder,
  folderContexts,
  onSelectContext,
}: {
  auth: Auth;
  onOpenFolder: () => void;
  folderContexts: SpaceContext[];
  onSelectContext: (ref: string) => void;
}) {
  const signingIn = auth.status === "signing-in";
  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 flex flex-col items-center text-center">
        <LogoSymbol className="h-12 w-12 text-is-text" />
        <h1 className="mt-4 text-2xl font-medium text-is-text">IdeaSpaces</h1>
        <p className="mt-1 max-w-xs text-sm text-is-text-secondary">
          A place where teams of agents and people work together.
        </p>
      </div>
      <div className="space-y-3">
        <ConnectCard
          icon={Cloud}
          title="Connect IdeaSpace"
          description="Sign in to sync your spaces and work with Keeper."
        >
          <button className={primaryButton} onClick={auth.signIn} disabled={signingIn}>
            {signingIn ? "Waiting for browser…" : "Sign in"}
          </button>
          {signingIn && (
            <p className="mt-2 text-sm text-is-text-tertiary">
              Complete sign-in in the browser window that opened.{" "}
              <button
                className="underline underline-offset-2 hover:text-is-text"
                onClick={auth.cancelSignIn}
              >
                Cancel
              </button>
            </p>
          )}
          {auth.error && <p className="mt-2 text-sm text-is-danger-text">{auth.error}</p>}
        </ConnectCard>
        <ConnectCard
          icon={FolderOpen}
          title="Open a folder"
          description="Edit local Markdown — no account needed."
          onClick={onOpenFolder}
        />
        <ConnectCard
          icon={Bot}
          title="Connect Pi"
          description="A local agent that works in your folders."
          disabled
        />
      </div>
      {folderContexts.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 font-chrome text-[10px] uppercase tracking-[0.08em] text-is-text-tertiary">
            Your folders
          </h3>
          <div className="space-y-1.5">
            {folderContexts.map((ctx) => (
              <button
                key={ctx.ref}
                type="button"
                onClick={() => onSelectContext(ctx.ref)}
                title={ctx.path}
                className="flex w-full items-center gap-2 rounded-lg border border-is-border bg-is-surface px-3 py-2 text-left text-sm text-is-text transition hover:bg-is-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
              >
                <FolderOpen size={16} strokeWidth={1.333} className="shrink-0 text-is-text-tertiary" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{ctx.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Signed-out shell: the app frame always renders (a slim header with the mark +
// theme toggle) with the connect panel in the body — auth is a connector state,
// not a full-screen gate. The signed-in view is unchanged.
function SignedOutView({
  auth,
  mode,
  setMode,
  activeRef,
  onSelectContext,
  folderContexts,
  onOpenFolder,
  onCloseFolder,
  onLeaveFolder,
}: {
  auth: Auth;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
} & ShellContextProps) {
  // A folder can be open without an account — show it in the shell, with the
  // switcher to move between folders. Otherwise, the connect panel.
  const activeFolder = folderContexts.find((c) => c.ref === activeRef) ?? null;
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="shrink-0 border-b border-is-border bg-is-bg px-4 py-1.5 font-chrome sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            {activeFolder ? (
              <button
                type="button"
                onClick={onLeaveFolder}
                aria-label="Home"
                title="Home"
                className="inline-flex shrink-0 items-center rounded text-is-text transition hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
              >
                <LogoSymbol className="h-6 w-7" />
              </button>
            ) : (
              <LogoSymbol className="h-6 w-7 text-is-text" />
            )}
            {activeFolder && (
              <>
                <span className="h-4 w-px shrink-0 bg-is-border" />
                <ContextSwitcher
                  contexts={folderContexts}
                  activeContext={activeFolder}
                  onSelect={onSelectContext}
                  onOpenFolder={onOpenFolder}
                  onCloseFolder={onCloseFolder}
                />
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {/* Only in a folder — at root the connect panel's card is the sign-in
                CTA, so a header button too would be redundant. */}
            {activeFolder && (
              <button
                type="button"
                onClick={auth.signIn}
                disabled={auth.status === "signing-in"}
                className="rounded-md px-2.5 py-1 text-xs font-medium text-is-text transition hover:bg-is-surface-alt disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
              >
                {auth.status === "signing-in" ? "Signing in…" : "Sign in"}
              </button>
            )}
            <ThemeToggle mode={mode} setMode={setMode} />
          </div>
        </div>
      </header>
      {activeFolder ? (
        <FolderEditor context={activeFolder} onLeave={onLeaveFolder} />
      ) : (
        <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-8 py-10">
          {auth.status === "checking" ? (
            <div className="flex flex-col items-center gap-4">
              <LogoSymbol className="h-10 w-10 text-is-text-tertiary" />
              <p className="text-sm text-is-text-tertiary">Checking sign-in…</p>
            </div>
          ) : (
            <ConnectPanel
              auth={auth}
              onOpenFolder={onOpenFolder}
              folderContexts={folderContexts}
              onSelectContext={onSelectContext}
            />
          )}
        </main>
      )}
    </div>
  );
}

function App() {
  const auth = useAuth();
  const { mode, setMode } = useTheme();
  const signedIn = auth.status === "signed-in" || auth.status === "signing-out";

  // Context selection lives here, above the signed-in/out split, so an
  // accountless folder can be opened and worked in either state. Restore the
  // last-used context once on mount; never clobber a selection already made.
  const { folders, openFolder, closeFolder } = useOpenedFolders();
  const [activeRef, setActiveRef] = useState<string | undefined>(undefined);
  useEffect(() => {
    void getActiveContextRef().then((ref) => {
      if (ref) setActiveRef((cur) => cur ?? ref);
    });
  }, []);
  const onSelectContext = useCallback((ref: string) => {
    setActiveRef(ref);
    void setActiveContextRef(ref);
  }, []);
  const folderContexts = useMemo(() => folders.map(folderContext), [folders]);
  const onOpenFolder = useCallback(() => {
    void openFolder().then((path) => {
      if (path) onSelectContext(`folder:${path}`);
    });
  }, [openFolder, onSelectContext]);
  // Remove a folder from the list; if it was active, fall back to the default
  // context (first account context signed-in, else the connect panel).
  const onCloseFolder = useCallback(
    (ctx: SpaceContext) => {
      if (!ctx.path) return;
      void closeFolder(ctx.path);
      if (activeRef === ctx.ref) setActiveRef(undefined);
    },
    [closeFolder, activeRef],
  );
  // Leave the active folder → fall back to the default context (first account
  // context signed-in, else the connect panel). Clear the persisted ref so a
  // deliberate exit isn't reopened on relaunch.
  const onLeaveFolder = useCallback(() => {
    setActiveRef(undefined);
    void setActiveContextRef("");
  }, []);

  const shell: ShellContextProps = {
    activeRef,
    onSelectContext,
    folderContexts,
    onOpenFolder,
    onCloseFolder,
    onLeaveFolder,
  };

  // The update banner overlays every auth state — rendered once, above the
  // branch, so a new auth state can never accidentally drop it.
  return (
    <>
      <UpdateBanner />
      <UpdatedNotice />
      {signedIn ? (
        <SignedInView auth={auth} mode={mode} setMode={setMode} {...shell} />
      ) : (
        <SignedOutView auth={auth} mode={mode} setMode={setMode} {...shell} />
      )}
    </>
  );
}

export default App;
