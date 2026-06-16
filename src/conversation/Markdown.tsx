// Styled markdown renderer for LLM output in AssistantMessage —
// transplanted from is_web (`src/conversation/Markdown.tsx`). Renderers map to
// the desktop's `--is-*` tokens.
//
// rehype-sanitize runs the default github-like schema so script/iframe/etc. are
// stripped. No syntax highlighting today — fenced code renders as a plain
// `<pre><code>`; a highlighter can slot in later without touching consumers.

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

export interface MarkdownProps {
  children: string;
  className?: string;
  /** When true, a blinking cursor is appended to the last rendered element via
   *  CSS `::after`. Use during streaming so the cursor stays inline with the
   *  final character (a sibling span would detach below the block output). */
  streaming?: boolean;
}

export function Markdown({ children, className = "", streaming = false }: MarkdownProps) {
  return (
    <div className={`break-words text-is-text ${streaming ? "is-md-streaming" : ""} ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={COMPONENTS}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

type Renderer<Tag extends keyof React.JSX.IntrinsicElements> = (
  props: ComponentPropsWithoutRef<Tag> & { children?: ReactNode },
) => ReactNode;

const H1: Renderer<"h1"> = (props) => (
  <h1
    className="mb-4 mt-8 text-2xl font-semibold leading-tight tracking-tight text-is-text first:mt-0"
    {...props}
  />
);

const H2: Renderer<"h2"> = (props) => (
  <h2
    className="mb-3 mt-8 text-xl font-semibold leading-tight tracking-tight text-is-text first:mt-0"
    {...props}
  />
);

const H3: Renderer<"h3"> = (props) => (
  <h3
    className="mb-2 mt-6 text-lg font-medium leading-tight tracking-tight text-is-text first:mt-0"
    {...props}
  />
);

const P: Renderer<"p"> = (props) => (
  <p className="my-3 text-base leading-relaxed text-is-text first:mt-0 last:mb-0" {...props} />
);

const A: Renderer<"a"> = ({ href, ...props }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="text-is-text underline decoration-is-text-tertiary underline-offset-2 hover:decoration-is-text"
    {...props}
  />
);

const UL: Renderer<"ul"> = (props) => (
  <ul className="my-3 list-disc space-y-1 pl-6 first:mt-0 last:mb-0" {...props} />
);

const OL: Renderer<"ol"> = (props) => (
  <ol className="my-3 list-decimal space-y-1 pl-6 first:mt-0 last:mb-0" {...props} />
);

const LI: Renderer<"li"> = (props) => (
  <li className="text-base leading-relaxed text-is-text" {...props} />
);

// Inline vs fenced code. react-markdown v10 removed the `inline` prop, so we
// derive it: a language-* className is always a fenced block; otherwise any
// newline marks it block too (covers unlabelled ``` fences). Else inline.
const CODE: Renderer<"code"> = ({ className, children, ...props }) => {
  const text = typeof children === "string" ? children : "";
  const isBlock = (className?.startsWith("language-") ?? false) || text.includes("\n");
  if (isBlock) {
    return (
      <code className={`font-mono text-sm text-is-text ${className ?? ""}`} {...props}>
        {children}
      </code>
    );
  }
  return (
    <code className="rounded bg-is-bg px-1 py-0.5 font-mono text-[0.9em] text-is-text" {...props}>
      {children}
    </code>
  );
};

const PRE: Renderer<"pre"> = (props) => (
  <pre
    className="my-4 overflow-x-auto rounded-lg border border-is-border bg-is-bg p-3 text-sm first:mt-0 last:mb-0"
    {...props}
  />
);

const BLOCKQUOTE: Renderer<"blockquote"> = (props) => (
  <blockquote
    className="my-3 border-l-2 border-is-border pl-3 italic text-is-text-secondary first:mt-0 last:mb-0"
    {...props}
  />
);

const TABLE: Renderer<"table"> = (props) => (
  <div className="my-4 overflow-x-auto first:mt-0 last:mb-0">
    <table className="w-full border-collapse text-base" {...props} />
  </div>
);

const TH: Renderer<"th"> = (props) => (
  <th
    className="border-b border-is-border px-2 py-1 text-left text-base font-medium text-is-text"
    {...props}
  />
);

const TD: Renderer<"td"> = (props) => (
  <td className="border-b border-is-border px-2 py-1 text-base text-is-text" {...props} />
);

const HR: Renderer<"hr"> = (props) => <hr className="my-4 border-is-border" {...props} />;

const COMPONENTS = {
  h1: H1,
  h2: H2,
  h3: H3,
  h4: H3,
  h5: H3,
  h6: H3,
  p: P,
  a: A,
  ul: UL,
  ol: OL,
  li: LI,
  code: CODE,
  pre: PRE,
  blockquote: BLOCKQUOTE,
  table: TABLE,
  th: TH,
  td: TD,
  hr: HR,
} as const;
