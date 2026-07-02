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

  try {
    await new Promise<void>((resolve) => {
      root.render(<PrintDocument markdown={markdown} onReady={resolve} />);
    });
    await invoke("print_page");
  } finally {
    // The native print operation can render on a separate thread; give it a beat
    // to snapshot the DOM before we tear the host down.
    setTimeout(() => {
      root.unmount();
      host.remove();
    }, 1500);
  }
}
