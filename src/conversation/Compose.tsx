// The chat compose box — v2 look: a rounded card with the textarea on top and a
// controls row beneath (model tier + Think toggle on the left, Send / Stop on
// the right). Owns its draft + model-tier + thinking state and hands a trimmed
// message plus the chosen options to `onSend`. @-mentions / voice are still
// deferred (the bigger MentionComposer features in is_web).

import { useEffect, useRef, useState } from "react";
import { MODEL_TIERS, MODEL_TIER_INFO } from "./model-tiers";
import type { ModelTier } from "./keeper-types";
import { cn } from "../lib/cn";
import { useToast } from "../toast/toast-context";

// OS arg-length cap on the CLI's `--message` (see lib/cli.ts). macOS ARG_MAX is
// ~256 KB shared across all args; keep a safe ceiling well under it.
const MAX_MESSAGE_CHARS = 100_000;

export interface SendOptions {
  modelTier: ModelTier;
  thinking: boolean;
}

export function Compose({
  onSend,
  onStop,
  streaming,
  disabled = false,
  defaultModelTier = "sonnet",
}: {
  onSend: (text: string, opts: SendOptions) => void;
  onStop: () => void;
  streaming: boolean;
  disabled?: boolean;
  defaultModelTier?: ModelTier;
}) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [modelTier, setModelTier] = useState<ModelTier>(defaultModelTier);
  const [thinking, setThinking] = useState(false);
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
    onSend(trimmed, { modelTier, thinking });
    setText("");
  };

  const pill =
    "rounded px-2 py-1 font-chrome text-[11px] uppercase tracking-[0.04em] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-is-focus-ring disabled:opacity-50";

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
      <div className="mt-2 flex items-center gap-2">
        {/* Segmented model picker — flat pills, not a native <select> (renders
            inconsistently in the webview, and the Think pill beside it is the
            proven pattern). */}
        <div
          role="radiogroup"
          aria-label="Model"
          className="flex items-center gap-0.5 rounded bg-is-surface-alt p-0.5"
        >
          {MODEL_TIERS.map((tier) => (
            <button
              key={tier}
              type="button"
              role="radio"
              aria-checked={modelTier === tier}
              onClick={() => setModelTier(tier)}
              disabled={disabled}
              title={MODEL_TIER_INFO[tier].description}
              className={cn(
                "rounded px-2 py-0.5 font-chrome text-[11px] uppercase tracking-[0.04em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring disabled:opacity-50",
                modelTier === tier
                  ? "bg-is-text text-is-bg"
                  : "text-is-text-tertiary hover:text-is-text",
              )}
            >
              {MODEL_TIER_INFO[tier].label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setThinking((v) => !v)}
          disabled={disabled}
          aria-pressed={thinking}
          title="Show the model's thinking"
          className={cn(
            pill,
            thinking
              ? "bg-is-text text-is-bg"
              : "bg-is-surface-alt text-is-text-tertiary hover:text-is-text",
          )}
        >
          think
        </button>
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
