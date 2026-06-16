// The chat compose box — textarea + Enter-to-send + Send/Stop. Desktop-specific
// (is_web's ComposeInput carries voice/mentions/context-tray we don't ship).

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Square } from "lucide-react";
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
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
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
    <div className="shrink-0 py-3">
      <div className="flex items-end gap-2 rounded-2xl border border-is-border bg-is-surface px-3 py-2 transition focus-within:border-is-accent">
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
          placeholder="Message Keeper…"
          aria-label="Message"
          disabled={disabled}
          className="max-h-40 flex-1 resize-none bg-transparent text-sm leading-relaxed text-is-text outline-none placeholder:text-is-text-tertiary disabled:opacity-60"
        />
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop"
            title="Stop"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-is-text text-is-bg transition hover:opacity-90"
          >
            <Square size={13} strokeWidth={2} fill="currentColor" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim() || disabled}
            aria-label="Send"
            title="Send"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-is-text text-is-bg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowUp size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
