// Must run before any module that assumes Node's `global` (e.g. the UMD docx
// lib used for export). Keep this the first import.
import "./lib/node-global-shim";
import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource/fragment-mono";
// Serif headings (prose surfaces + the editor). Loaded here by the host — the
// shared @ideaspaces/editor package is font-agnostic, so we provide the font.
import "@fontsource/sorts-mill-goudy";
import "./index.css";
import App from "./App";
import { ToastProvider } from "./toast/ToastProvider";
import { UpdaterProvider } from "./updater/UpdaterProvider";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ToastProvider>
      <UpdaterProvider>
        <App />
      </UpdaterProvider>
    </ToastProvider>
  </React.StrictMode>,
);
