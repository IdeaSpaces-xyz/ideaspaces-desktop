import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Bot, Cloud, FolderOpen, type LucideIcon } from "lucide-react";
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
import { useTheme, type ThemeMode } from "./theme/useTheme";
import { deriveSpaceContexts, resolveContext, spacesForContext } from "./lib/space-context";
import { deriveRepoEntries } from "./lib/repo-entry";
import { getActiveContextRef, setActiveContextRef } from "./lib/active-context";
import { fromClone, type Location } from "./lib/location";

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
}: {
  auth: Auth;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}) {
  const spaces = useSpaces();
  const actions = useSpaceActions(spaces.reload);
  const [activeRef, setActiveRef] = useState<string | undefined>(undefined);
  // The open editor: a clone, optionally jumped to a specific note (from search).
  const [editing, setEditing] = useState<{ location: Location; note?: string } | undefined>(
    undefined,
  );
  // Repo to preselect in the home composer — set when "Start conversation" is
  // hit from inside a repo's tree, so the draft opens already scoped to it.
  const [convoRepoId, setConvoRepoId] = useState<string | undefined>(undefined);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Restore the last-used context once on mount; never clobber a selection the
  // user has already made (cur ?? stored). Saved on every switch below.
  useEffect(() => {
    void getActiveContextRef().then((ref) => {
      if (ref) setActiveRef((cur) => cur ?? ref);
    });
  }, []);
  const selectContext = useCallback((ref: string) => {
    setActiveRef(ref);
    void setActiveContextRef(ref);
    setConvoRepoId(undefined); // a pending preselect belongs to the old context
  }, []);

  const contexts = useMemo(
    () => deriveSpaceContexts(spaces.username, spaces.spaces),
    [spaces.username, spaces.spaces],
  );
  const activeContext = resolveContext(contexts, activeRef);
  const visibleSpaces = useMemo(
    () => (activeContext ? spacesForContext(spaces.spaces, activeContext) : spaces.spaces),
    [activeContext, spaces.spaces],
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
        onSelectContext={selectContext}
        onHome={() => setEditing(undefined)}
        username={spaces.username ?? undefined}
        mode={mode}
        setMode={setMode}
        onSignOut={auth.signOut}
        signingOut={auth.status === "signing-out"}
      />
      {editing ? (
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

// One of the three connectors on the signed-out empty state. A card with an
// icon, a title, and a description; `disabled` dims it and shows a "Soon" tag
// (Open folder ships in S2, Connect Pi in S4 — they're shown now so the
// three-layer shape reads at a glance).
function ConnectCard({
  icon: Icon,
  title,
  description,
  disabled,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border border-is-border bg-is-surface p-4 text-left${
        disabled ? " opacity-60" : ""
      }`}
    >
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
    </div>
  );
}

// The signed-out empty state: the three connectors (IdeaSpace live; Open folder
// and Connect Pi shown as coming soon). The sign-in flow (button label, cancel,
// error) lives in the IdeaSpace card.
function ConnectPanel({ auth }: { auth: Auth }) {
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
          disabled
        />
        <ConnectCard
          icon={Bot}
          title="Connect Pi"
          description="A local agent that works in your folders."
          disabled
        />
      </div>
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
}: {
  auth: Auth;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="shrink-0 border-b border-is-border bg-is-bg px-4 py-1.5 font-chrome sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <LogoSymbol className="h-6 w-7 text-is-text" />
          <ThemeToggle mode={mode} setMode={setMode} />
        </div>
      </header>
      <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-8 py-10">
        {auth.status === "checking" ? (
          <div className="flex flex-col items-center gap-4">
            <LogoSymbol className="h-10 w-10 text-is-text-tertiary" />
            <p className="text-sm text-is-text-tertiary">Checking sign-in…</p>
          </div>
        ) : (
          <ConnectPanel auth={auth} />
        )}
      </main>
    </div>
  );
}

function App() {
  const auth = useAuth();
  const { mode, setMode } = useTheme();

  const signedIn = auth.status === "signed-in" || auth.status === "signing-out";

  // The update banner overlays every auth state — rendered once, above the
  // branch, so a new auth state can never accidentally drop it.
  return (
    <>
      <UpdateBanner />
      <UpdatedNotice />
      {signedIn ? (
        <SignedInView auth={auth} mode={mode} setMode={setMode} />
      ) : (
        <SignedOutView auth={auth} mode={mode} setMode={setMode} />
      )}
    </>
  );
}

export default App;
