import { useAuth } from "./auth/useAuth";
import "./App.css";

function App() {
  const auth = useAuth();

  if (auth.status === "checking") {
    return (
      <main className="container">
        <p>Checking sign-in…</p>
      </main>
    );
  }

  if (auth.status === "signed-in" || auth.status === "signing-out") {
    const signingOut = auth.status === "signing-out";
    return (
      <main className="container">
        <h1>IdeaSpaces</h1>
        <p>Signed in{auth.apiUrl ? ` to ${auth.apiUrl}` : ""}.</p>
        <button onClick={auth.signOut} disabled={signingOut}>
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
        {auth.error && <p className="error">{auth.error}</p>}
      </main>
    );
  }

  const signingIn = auth.status === "signing-in";
  return (
    <main className="container">
      <h1>IdeaSpaces</h1>
      <p>Local-first knowledge, with built-in sync.</p>
      <button onClick={auth.signIn} disabled={signingIn}>
        {signingIn ? "Waiting for browser…" : "Sign in"}
      </button>
      {signingIn && (
        <p>
          Complete sign-in in the browser window that opened.{" "}
          <button onClick={auth.cancelSignIn}>Cancel</button>
        </p>
      )}
      {auth.error && <p className="error">{auth.error}</p>}
    </main>
  );
}

export default App;
