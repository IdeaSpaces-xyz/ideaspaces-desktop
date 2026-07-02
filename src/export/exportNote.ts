// Export a note to other formats. The source is the note's PURE markdown body:
// the frontmatter is stripped (we don't dump the YAML), and the note's title is
// set as the single H1 so the document isn't headless. PDF export lives in
// printPdf.tsx (native print of the sanitized note); this module owns the
// markdown→HTML shaping and the .docx path.

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
