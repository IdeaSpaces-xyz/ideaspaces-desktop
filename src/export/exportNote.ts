// Export a note to other formats. v1: PDF via the OS print pipeline (Save as
// PDF), shaped with our own editorial print typography — independent of the
// app theme. The source is the note's PURE markdown body: the frontmatter is
// stripped (we don't dump the YAML), and the note's title is set as the single
// H1 so the document isn't headless. We're the shapers of the markdown, so the
// export format is ours to define.

import { marked } from "marked";
import { bodyStartOffset } from "@ideaspaces/editor/frontmatter";

/** The note's markdown body (frontmatter stripped) with its title as the H1. */
export function noteToMarkdown(content: string, title: string): string {
  const body = content.slice(bodyStartOffset(content)).replace(/^\n+/, "");
  const heading = title.trim();
  // Don't double the title if the body already opens with a heading.
  const startsWithHeading = /^#{1,6}\s/.test(body);
  return heading && !startsWithHeading ? `# ${heading}\n\n${body}` : body;
}

/** Render the export markdown to HTML (GFM: tables, task lists, etc.). */
export function noteToHtml(content: string, title: string): string {
  return marked.parse(noteToMarkdown(content, title), { async: false, gfm: true });
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );
}

// Editorial print stylesheet — serif headings, readable sans body, light page.
// Fonts fall back to system families (the bundled @fontsource faces don't reach
// the print iframe); named first so a future font embed is a drop-in.
const PRINT_CSS = `
  @page { margin: 2cm; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; color: #18181b; background: #fff;
    font: 16px/1.7 "Inter", system-ui, -apple-system, sans-serif; }
  .prose { max-width: 100%; }
  .prose h1, .prose h2, .prose h3 { font-family: "Sorts Mill Goudy", Georgia, serif;
    font-weight: 400; color: #111; line-height: 1.2; }
  .prose h1 { font-size: 2.2rem; margin: 0 0 1rem; }
  .prose h2 { font-size: 1.6rem; margin: 2rem 0 0.75rem; }
  .prose h3 { font-size: 1.3rem; margin: 1.5rem 0 0.5rem; }
  .prose h4, .prose h5, .prose h6 { font-family: inherit; font-weight: 600;
    margin: 1.25rem 0 0.5rem; }
  .prose p { margin: 0 0 1rem; }
  .prose ul, .prose ol { margin: 0 0 1rem; padding-left: 1.5rem; }
  .prose li { margin: 0.25rem 0; }
  .prose blockquote { margin: 0 0 1rem; padding-left: 1rem;
    border-left: 3px solid #d4d4d8; color: #52525b; font-style: italic; }
  .prose code { font-family: "Fragment Mono", ui-monospace, SFMono-Regular, monospace;
    font-size: 0.9em; background: #f4f4f5; padding: 0.1em 0.35em; border-radius: 4px; }
  .prose pre { background: #f4f4f5; padding: 1rem; border-radius: 8px; overflow: auto; }
  .prose pre code { background: none; padding: 0; }
  .prose a { color: #2563eb; text-decoration: underline; }
  .prose img { max-width: 100%; }
  .prose table { border-collapse: collapse; width: 100%; margin: 0 0 1rem; }
  .prose th, .prose td { border: 1px solid #d4d4d8; padding: 0.4rem 0.6rem; text-align: left; }
  .prose hr { border: none; border-top: 1px solid #d4d4d8; margin: 1.5rem 0; }
`;

/**
 * Save the note as PDF via the OS print dialog. Renders the note into a hidden
 * iframe with our print styles and prints just that — so the user gets a clean,
 * faithful "Save as PDF" without the app chrome.
 */
export function printNoteAsPdf(
  content: string,
  title: string,
  onError?: (err: unknown) => void,
): void {
  const html = noteToHtml(content, title);
  const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
    title,
  )}</title><style>${PRINT_CSS}</style></head><body><article class="prose">${html}</article></body></html>`;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  // Block active content (notes can come from a shared/cloned space, and `marked`
  // doesn't sanitize): omitting `allow-scripts` stops <script> / inline handlers
  // from running. `allow-same-origin` is required so the parent can write the doc
  // and call print(); `allow-modals` so print() can open the OS dialog.
  iframe.setAttribute("sandbox", "allow-same-origin allow-modals");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);

  const idoc = iframe.contentDocument;
  const cw = iframe.contentWindow;
  if (!idoc || !cw) {
    iframe.remove();
    throw new Error("Could not open a print view.");
  }

  let removed = false;
  const cleanup = () => {
    if (removed) return;
    removed = true;
    iframe.remove();
  };
  cw.addEventListener("afterprint", cleanup);
  // Fallback: some webviews never fire afterprint — remove on a short timer.
  setTimeout(cleanup, 10_000);

  idoc.open();
  idoc.write(doc);
  idoc.close();

  // Give the iframe a tick to lay out before printing. print() is async to the
  // caller, so surface its (rare) failures through onError, not a dropped throw.
  setTimeout(() => {
    try {
      cw.focus();
      cw.print();
    } catch (err) {
      cleanup();
      onError?.(err);
    }
  }, 200);
}

/** A filesystem-safe filename stem for the title (no slashes/specials). A
 *  fully non-ASCII title (e.g. Japanese, Hebrew) collapses to the "note" stem. */
function filenameFor(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "note"
  );
}

/** Drop remote-image tags before docx conversion: the docx lib would otherwise
 *  fetch `http(s)` `<img>` URLs to embed them, firing a network request at
 *  export time. Local-first → no surprise network; remote images aren't embedded
 *  in v1 (the alt text/text around them stays). */
function stripRemoteImages(html: string): string {
  return html.replace(/<img\b[^>]*?\bsrc\s*=\s*["']https?:[^"']*["'][^>]*>/gi, "");
}

/**
 * Save the note as a Word `.docx`. Pure markdown body → HTML (`marked`) → real,
 * editable OOXML (`@turbodocx/html-to-docx`, the browser-compatible fork) →
 * written to a path the user picks. The heavy docx lib + the Tauri plugins are
 * dynamically imported, so they stay out of the initial bundle (and the module
 * stays unit-testable in node). Returns the saved path, or null if cancelled.
 */
export async function saveNoteAsDocx(
  content: string,
  title: string,
  onStart?: () => void,
): Promise<string | null> {
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>${stripRemoteImages(
    noteToHtml(content, title),
  )}</body></html>`;

  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({
    defaultPath: `${filenameFor(title)}.docx`,
    filters: [{ name: "Word document", extensions: ["docx"] }],
  });
  if (!path) return null; // cancelled
  onStart?.(); // path chosen → conversion + write begins (the slow ~1–2s part)

  const { default: HTMLtoDOCX } = await import("@turbodocx/html-to-docx");
  const out = (await HTMLtoDOCX(html, undefined, { title })) as Blob | ArrayBuffer | Uint8Array;
  let bytes: Uint8Array;
  if (out instanceof Blob) bytes = new Uint8Array(await out.arrayBuffer());
  else if (out instanceof ArrayBuffer) bytes = new Uint8Array(out);
  else bytes = out; // already a Uint8Array

  const { writeFile } = await import("@tauri-apps/plugin-fs");
  await writeFile(path, bytes);
  return path;
}
