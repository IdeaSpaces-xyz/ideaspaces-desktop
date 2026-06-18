import { lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { Header } from "./components/Header";
import { LogoSymbol } from "./components/LogoSymbol";
import { RepoRail } from "./components/RepoRail";
import { ThemeToggle } from "./components/ThemeToggle";
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

// Code-split: the chat transcript pulls in react-markdown — load it only when
// the Conversations view opens, keeping the login/browse bundle light.
const ConversationsView = lazy(() =>
  import("./components/ConversationsView").then((m) => ({ default: m.ConversationsView })),
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
    // Fixed viewport height + overflow-hidden so inner panes (the repos list,
    // and the editor's tree vs. preview) each own their scroll instead of the
    // whole window growing and scrolling as one.
    <div className="flex h-dvh flex-col overflow-hidden">
      <Header
        contexts={contexts}
        activeContext={activeContext}
        onSelectContext={setActiveRef}
        onHome={() => setEditingClone(undefined)}
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
          <EditorSurface
            key={editingClone.path}
            clone={editingClone}
            onClose={() => setEditingClone(undefined)}
          />
        </Suspense>
      ) : (
        // Home: repos in the left rail (context-scoped), conversations as the
        // main surface. Clicking a repo opens the editor (above).
        <div className="flex min-h-0 flex-1">
          <RepoRail
            spaces={visibleSpaces}
            cloneIndex={cloneIndex}
            statuses={cloneStatuses.statuses}
            failedStatuses={cloneStatuses.failed}
            busyIds={actions.busyIds}
            status={spaces.status}
            error={spaces.error}
            onReload={() => void spaces.reload()}
            onOpen={setEditingClone}
            onClone={actions.clone}
            onCloneTo={actions.cloneTo}
            onLinkExisting={actions.linkExisting}
            onSync={actions.sync}
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
              />
            </Suspense>
          </main>
        </div>
      )}
      {auth.error && (
        <p className="fixed bottom-3 left-3 z-20 rounded-md border border-is-border bg-is-surface px-3 py-2 text-xs text-is-danger-text shadow-md">
          {auth.error}
        </p>
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
