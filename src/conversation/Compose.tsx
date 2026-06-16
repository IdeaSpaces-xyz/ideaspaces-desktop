// The chat compose box — v2 look: a rounded card with the textarea on top and a
// controls row beneath (Send / Stop, right-aligned). Minimal by choice — no
// model-tier picker / Think toggle / @-mentions (deferred features).

import { useEffect, useRef, useState } from "react";
import { useToast } from "../toast/toast-context";

// OS arg-length cap on the CLI's `--message` (see lib/cli.ts). macOS ARG_MAX is
// ~256 KB shared across all args; keep a safe ceiling well under it.
const MAX_MESSAGE_CHARS = 100_000;

export function Compose({
  onSend,
  onStop,
  streaming,
  disabled = false,
}: {
  onSend: (text: string) => void;
  onStop: () => void;
  streaming: boolean;
  disabled?: boolean;
}) {
  const toast = useToast();
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea with its content, up to a max height.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [text]);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || streaming || disabled) return;
    if (trimmed.length > MAX_MESSAGE_CHARS) {
      toast(`Message is too long (max ${MAX_MESSAGE_CHARS.toLocaleString()} characters).`, "error");
      return;
    }
    onSend(trimmed);
    setText("");
  };

  return (
    <div className="rounded-2xl border border-is-border bg-is-surface p-3.5 shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
      <textarea
        ref={taRef}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Ask Keeper…"
        aria-label="Message"
        disabled={disabled}
        className="block max-h-[200px] min-h-[3.5rem] w-full resize-none bg-transparent font-sans text-sm leading-relaxed text-is-text outline-none placeholder:text-is-text-tertiary disabled:opacity-60"
      />
      <div className="mt-2 flex items-center">
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            className="ml-auto inline-flex h-8 items-center rounded-md border border-is-border px-3 font-chrome text-xs text-is-text-secondary transition hover:text-is-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim() || disabled}
            className="ml-auto inline-flex h-8 items-center rounded-md bg-is-text px-3.5 font-chrome text-xs text-is-bg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
