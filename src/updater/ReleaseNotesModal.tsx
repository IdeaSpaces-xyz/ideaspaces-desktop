import { useEffect, useRef, type ComponentPropsWithoutRef } from "react";
import { X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

// Marker the release workflow emits before the GitHub-only download footer.
// Explicit (vs. splitting on `---`) so a Chronicle entry can use thematic
// breaks freely without losing its tail to the split.
const FOOTER_MARKER = /<!--\s*release-footer\s*-->/;

// The release's story (the Chronicle entry, carried in update.body), rendered
// as sanitized markdown. Lazy-loaded so react-markdown only loads when someone
// actually opens "what's new". rehype-sanitize strips any script/handler — the
// notes come from our own releases, but we render them as untrusted anyway.
export default function ReleaseNotesModal({
  version,
  notes,
  onClose,
}: {
  version: string;
  notes: string;
  onClose: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Escape to close + a focus trap: focus lands in the modal on open and Tab
  // cycles within it instead of leaking to the app behind.
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const focusables = () =>
      Array.from(
        card.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => !el.hasAttribute("disabled"));

    focusables()[0]?.focus(); // initial focus (the close button)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    card.addEventListener("keydown", onKey);
    return () => card.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The release body is "<Chronicle story> <!-- release-footer --> <footer>".
  // In-app we show only the story; the footer is for people downloading the DMG.
  const story = notes.split(FOOTER_MARKER)[0].trim();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`What's new in version ${version}`}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        ref={cardRef}
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-is-border bg-is-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-is-border px-5 py-3">
          <h2 className="font-chrome text-[14px] text-is-text">What&apos;s new — v{version}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-is-text-tertiary transition hover:text-is-text"
          >
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 text-[14px] leading-relaxed text-is-text">
          {story ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeSanitize]}
              components={NOTES_COMPONENTS}
            >
              {story}
            </ReactMarkdown>
          ) : (
            <p className="text-is-text-secondary">No release notes for this version.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// Light prose styling for the Chronicle entry — bold titles, a quote block for
// the figure, a code span for the literal artifact (e.g. an error string).
const NOTES_COMPONENTS = {
  p: (props: ComponentPropsWithoutRef<"p">) => <p className="mb-3 last:mb-0" {...props} />,
  strong: (props: ComponentPropsWithoutRef<"strong">) => (
    <strong className="font-medium text-is-text" {...props} />
  ),
  em: (props: ComponentPropsWithoutRef<"em">) => (
    <em className="italic text-is-text-secondary" {...props} />
  ),
  h2: (props: ComponentPropsWithoutRef<"h2">) => (
    <h2 className="mb-2 mt-4 font-chrome text-[15px] text-is-text first:mt-0" {...props} />
  ),
  h3: (props: ComponentPropsWithoutRef<"h3">) => (
    <h3 className="mb-1.5 mt-3 font-chrome text-[13px] text-is-text-secondary" {...props} />
  ),
  ul: (props: ComponentPropsWithoutRef<"ul">) => (
    <ul className="mb-3 list-disc space-y-1 pl-5" {...props} />
  ),
  code: (props: ComponentPropsWithoutRef<"code">) => (
    <code className="rounded bg-is-surface-alt px-1 py-0.5 font-chrome text-[12px]" {...props} />
  ),
  blockquote: (props: ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote
      className="my-3 border-l-2 border-is-border pl-3 text-is-text-secondary"
      {...props}
    />
  ),
  a: ({ href, ...props }: ComponentPropsWithoutRef<"a">) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-is-accent underline" {...props} />
  ),
};
