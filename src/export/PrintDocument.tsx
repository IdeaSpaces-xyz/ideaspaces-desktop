import { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

// The note rendered for print. It's injected into the live (privileged) app
// document, so the markdown is sanitized with rehype-sanitize — a note can come
// from a shared/cloned space and must never smuggle active HTML (script,
// on*-handlers) into the webview. Styling is `.pdf-prose` in index.css, which
// only takes effect on the print page.
export function PrintDocument({ markdown, onReady }: { markdown: string; onReady: () => void }) {
  useEffect(() => {
    // Two frames: let the markdown lay out before we hand off to the native
    // print operation, which snapshots the DOM as it starts.
    const id = requestAnimationFrame(() => requestAnimationFrame(onReady));
    return () => cancelAnimationFrame(id);
  }, [onReady]);

  return (
    <article className="pdf-prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {markdown}
      </ReactMarkdown>
    </article>
  );
}
