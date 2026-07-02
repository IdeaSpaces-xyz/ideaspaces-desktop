import { createRoot, type Root } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { noteToMarkdown } from "./exportNote";
import { PrintDocument } from "./PrintDocument";

// Save as PDF via the OS print panel (macOS: "PDF ▸ Save as PDF"). The webview's
// `window.print()` is a no-op in WKWebView, so we render the note into an
// offscreen host and trigger the *native* print through a Rust command
// (`print_page`). `@media print` (index.css) hides the app and shows only the
// host, so the panel prints a clean document — not the app chrome.
//
// The host is PERSISTENT and never torn down: WKWebView rasterizes the PDF
// lazily, as the user completes the Save dialog (seconds after the panel opens).
// Removing the content on a timer left those late-rendered pages blank — the
// print preview showed the note, but the saved file did not. Keeping the host
// mounted (it just holds the last exported note, parked offscreen) fixes that.
let host: HTMLDivElement | null = null;
let hostRoot: Root | null = null;

function ensureRoot(): Root {
  if (!host || !hostRoot) {
    host = document.createElement("div");
    host.id = "pdf-print-root";
    document.body.appendChild(host);
    hostRoot = createRoot(host);
  }
  return hostRoot;
}

export async function printNoteAsPdf(content: string, title: string): Promise<void> {
  const markdown = noteToMarkdown(content, title);
  const root = ensureRoot();

  // macOS uses the document title as the default "Save as PDF" filename — point
  // it at the note (the app's static <title> would otherwise name every export
  // "IdeaSpaces"). The panel captures the job title when it opens, so restoring
  // it shortly after is safe.
  const prevTitle = document.title;
  document.title = title.trim() || "note";

  try {
    await new Promise<void>((resolve) => {
      root.render(<PrintDocument markdown={markdown} onReady={resolve} />);
    });
    await invoke("print_page");
  } finally {
    setTimeout(() => {
      document.title = prevTitle;
    }, 1500);
  }
}
