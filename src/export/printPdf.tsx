import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { noteToMarkdown } from "./exportNote";
import { PrintDocument } from "./PrintDocument";

// Save as PDF via the OS print panel (macOS: "PDF ▸ Save as PDF"). The webview's
// `window.print()` is a no-op in WKWebView, so we render the note into an
// offscreen host and trigger the *native* print through a Rust command
// (`print_page`). `@media print` (index.css) hides the app and shows only the
// note host, so the panel prints a clean document — not the app chrome.
export async function printNoteAsPdf(content: string, title: string): Promise<void> {
  const markdown = noteToMarkdown(content, title);

  const host = document.createElement("div");
  host.id = "pdf-print-root";
  document.body.appendChild(host);
  const root = createRoot(host);

  // macOS uses the document title as the default "Save as PDF" filename. Point
  // it at the note (the app's static <title> would otherwise name every export
  // "Tauri + React + Typescript"). Restored after the panel has read it.
  const prevTitle = document.title;
  document.title = title.trim() || "note";

  try {
    await new Promise<void>((resolve) => {
      root.render(<PrintDocument markdown={markdown} onReady={resolve} />);
    });
    await invoke("print_page");
  } finally {
    // The native print operation can render on a separate thread and reads the
    // title when the save panel opens; give it a beat before restoring + tearing
    // the host down.
    setTimeout(() => {
      document.title = prevTitle;
      root.unmount();
      host.remove();
    }, 1500);
  }
}
