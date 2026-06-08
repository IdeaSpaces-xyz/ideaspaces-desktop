import { useState } from "react";
import { Command } from "@tauri-apps/plugin-shell";
import "./App.css";

function App() {
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);

  // Smoke test for the bundled CLI sidecar: runs `ideaspaces status --json`
  // and shows the result. Proves the desktop → sidecar pipeline end to end.
  async function checkCli() {
    setRunning(true);
    setOutput("");
    try {
      const result = await Command.sidecar("binaries/ideaspaces", [
        "status",
        "--json",
      ]).execute();
      setOutput(result.stdout || result.stderr || `(exited ${result.code})`);
    } catch (err) {
      setOutput(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="container">
      <h1>IdeaSpaces</h1>
      <p>Desktop client — CLI sidecar smoke test.</p>
      <button onClick={checkCli} disabled={running}>
        {running ? "Running…" : "Check CLI sidecar"}
      </button>
      <pre>{output}</pre>
    </main>
  );
}

export default App;
