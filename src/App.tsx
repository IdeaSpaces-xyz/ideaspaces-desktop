import { lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { ConversationsView } from "./components/ConversationsView";
import { Header } from "./components/Header";
import { LogoSymbol } from "./components/LogoSymbol";
import { Rail, type View } from "./components/Rail";
import { SpacesList } from "./components/SpacesList";
import { ThemeToggle } from "./components/ThemeToggle";
import { WorkspaceBar } from "./components/WorkspaceBar";
import { useAuth } from "./auth/useAuth";
import { useSpaces } from "./spaces/useSpaces";
import { useSpaceActions } from "./spaces/useSpaceActions";
import { useCloneStatuses } from "./spaces/useCloneStatuses";
import { useTheme, type ThemeMode } from "./theme/useTheme";
import { deriveSpaceContexts, resolveContext, spacesForContext } from "./lib/space-context";
import type { CloneRecord } from "./lib/cli";

// Code-split: CodeMirror + the live-preview layer load only when a note opens,
// keeping the initial bundle (login/browse) light.
const EditorSurface = lazy(() =>
  import("./components/EditorSurface").then((m) => ({ default: m.EditorSurface })),
);

type Auth = ReturnType<typeof useAuth>;

function Screen({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-8 text-center">
      {children}
    </main>
  );
}

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
  const [view, setView] = useState<View>("repos");
  const [editingClone, setEditingClone] = useState<CloneRecord | undefined>(undefined);

  const contexts = useMemo(
    () => deriveSpaceContexts(spaces.username, spaces.spaces),
    [spaces.username, spaces.spaces],
  );
  const activeContext = resolveContext(contexts, activeRef);
  const visibleSpaces = useMemo(
    () => (activeContext ? spacesForContext(spaces.spaces, activeContext) : spaces.spaces),
    [activeContext, spaces.spaces],
  );
  const cloneIndex = useMemo(
    () => new Map(spaces.clones.map((c) => [c.repo_id, c])),
    [spaces.clones],
  );
  const cloneStatuses = useCloneStatuses(spaces.clones);

  return (
    <div className="flex min-h-dvh flex-col">
      <Header
        contexts={contexts}
        activeContext={activeContext}
        onSelectContext={setActiveRef}
        username={spaces.username ?? undefined}
        mode={mode}
        setMode={setMode}
        onSignOut={auth.signOut}
        signingOut={auth.status === "signing-out"}
      />
      {editingClone ? (
        <Suspense
          fallback={<div className="flex flex-1 items-center justify-center text-sm text-is-text-tertiary">Loading editor…</div>}
        >
          <EditorSurface clone={editingClone} onClose={() => setEditingClone(undefined)} />
        </Suspense>
      ) : (
      <div className="flex min-h-0 flex-1">
        <Rail view={view} onSelect={setView} />
        <main className="flex-1 overflow-y-auto">
          {view === "repos" ? (
            <div className="mx-auto w-full max-w-2xl px-6 py-8">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium text-is-text-secondary">Repos</h2>
                {spaces.clones.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void cloneStatuses.refresh()}
                    disabled={cloneStatuses.refreshing}
                    className="inline-flex items-center gap-1.5 text-xs text-is-text-tertiary transition hover:text-is-text disabled:opacity-50"
                  >
                    <RefreshCw
                      size={13}
                      strokeWidth={1.333}
                      className={cloneStatuses.refreshing ? "animate-spin" : undefined}
                      aria-hidden="true"
                    />
                    {cloneStatuses.refreshing ? "Refreshing…" : "Refresh status"}
                  </button>
                )}
              </div>
              <WorkspaceBar onLinkFolder={actions.linkFolder} linking={actions.linking} />
              {spaces.status === "loading" && (
                <p className="text-sm text-is-text-tertiary">Loading repos…</p>
              )}
              {spaces.status === "error" && (
                <p className="text-sm text-is-danger-text">
                  {spaces.error}{" "}
                  <button
                    className="underline underline-offset-2 hover:text-is-text"
                    onClick={() => void spaces.reload()}
                  >
                    Retry
                  </button>
                </p>
              )}
              {spaces.status === "loaded" && (
                <SpacesList
                  spaces={visibleSpaces}
                  cloneIndex={cloneIndex}
                  statuses={cloneStatuses.statuses}
                  failedStatuses={cloneStatuses.failed}
                  busyIds={actions.busyIds}
                  emptyMessage={
                    spaces.spaces.length === 0
                      ? "No repos yet — create one from your account to get started."
                      : "No repos in this context."
                  }
                  onClone={actions.clone}
                  onCloneTo={actions.cloneTo}
                  onLinkExisting={actions.linkExisting}
                  onSync={actions.sync}
                  onOpen={setEditingClone}
                />
              )}
              {auth.error && <p className="mt-3 text-sm text-is-danger-text">{auth.error}</p>}
            </div>
          ) : (
            <ConversationsView repos={visibleSpaces} reposLoading={spaces.status !== "loaded"} />
          )}
        </main>
      </div>
      )}
    </div>
  );
}

function CenteredAuth({ auth }: { auth: Auth }) {
  if (auth.status === "checking") {
    return (
      <Screen>
        <LogoSymbol className="h-10 w-10 text-is-text-tertiary" />
        <p className="text-sm text-is-text-tertiary">Checking sign-in…</p>
      </Screen>
    );
  }

  const signingIn = auth.status === "signing-in";
  return (
    <Screen>
      <LogoSymbol className="h-12 w-12 text-is-text" />
      <div className="space-y-1">
        <h1 className="text-2xl font-medium text-is-text">IdeaSpaces</h1>
        <p className="max-w-xs text-sm text-is-text-secondary">
          A place where teams of agents and people work together.
        </p>
      </div>
      <button className={primaryButton} onClick={auth.signIn} disabled={signingIn}>
        {signingIn ? "Waiting for browser…" : "Sign in"}
      </button>
      {signingIn && (
        <p className="text-sm text-is-text-tertiary">
          Complete sign-in in the browser window that opened.{" "}
          <button
            className="underline underline-offset-2 hover:text-is-text"
            onClick={auth.cancelSignIn}
          >
            Cancel
          </button>
        </p>
      )}
      {auth.error && <p className="text-sm text-is-danger-text">{auth.error}</p>}
    </Screen>
  );
}

function App() {
  const auth = useAuth();
  const { mode, setMode } = useTheme();

  if (auth.status === "signed-in" || auth.status === "signing-out") {
    return <SignedInView auth={auth} mode={mode} setMode={setMode} />;
  }

  return (
    <>
      <div className="fixed right-4 top-4 z-10">
        <ThemeToggle mode={mode} setMode={setMode} />
      </div>
      <CenteredAuth auth={auth} />
    </>
  );
}

export default App;
