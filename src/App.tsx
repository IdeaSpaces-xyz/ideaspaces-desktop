import type { ReactNode } from "react";
import { LogoSymbol } from "./components/LogoSymbol";
import { ThemeToggle } from "./components/ThemeToggle";
import { useAuth } from "./auth/useAuth";
import { useTheme } from "./theme/useTheme";

function Screen({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-8 text-center">
      {children}
    </main>
  );
}

const primaryButton =
  "rounded-lg bg-is-text px-5 py-2.5 text-sm font-medium text-is-bg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton =
  "rounded-lg border border-is-border bg-is-surface px-5 py-2.5 text-sm font-medium text-is-text transition hover:border-is-accent disabled:cursor-not-allowed disabled:opacity-50";

function AuthView() {
  const auth = useAuth();

  if (auth.status === "checking") {
    return (
      <Screen>
        <LogoSymbol className="h-10 w-10 text-is-text-tertiary" />
        <p className="text-sm text-is-text-tertiary">Checking sign-in…</p>
      </Screen>
    );
  }

  if (auth.status === "signed-in" || auth.status === "signing-out") {
    const signingOut = auth.status === "signing-out";
    return (
      <Screen>
        <LogoSymbol className="h-12 w-12 text-is-text" />
        <div className="space-y-1">
          <h1 className="text-2xl font-medium text-is-text">IdeaSpaces</h1>
          <p className="text-sm text-is-text-secondary">
            Signed in{auth.apiUrl ? ` to ${auth.apiUrl}` : ""}.
          </p>
        </div>
        <button className={secondaryButton} onClick={auth.signOut} disabled={signingOut}>
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
        {auth.error && <p className="text-sm text-is-danger-text">{auth.error}</p>}
      </Screen>
    );
  }

  const signingIn = auth.status === "signing-in";
  return (
    <Screen>
      <LogoSymbol className="h-12 w-12 text-is-accent" />
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
  const { mode, setMode } = useTheme();

  return (
    <>
      <div className="fixed right-4 top-4 z-10">
        <ThemeToggle mode={mode} setMode={setMode} />
      </div>
      <AuthView />
    </>
  );
}

export default App;
