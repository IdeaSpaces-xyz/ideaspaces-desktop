import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource/fragment-mono";
// Sorts Mill Goudy (serif headings) is only used by the editor — imported in
// the lazy editor chunk (extensions.ts), not here, to keep initial CSS light.
import "./index.css";
import App from "./App";
import { ToastProvider } from "./toast/ToastProvider";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>,
);
