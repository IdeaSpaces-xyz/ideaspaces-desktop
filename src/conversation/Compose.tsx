// The chat compose box — v2 look: textarea on top and a controls row beneath
// (model tier + Think toggle on the left, Send / Stop on the right). Rendered
// inside ComposerShell, which owns the card chrome (border/background) so the
// workspace strip can share it. Owns its draft + model-tier + thinking state and hands a trimmed
// message plus the chosen options to `onSend`.
//
// @-mentions are opt-in: when `mentionSource` is provided (the local Pi surface),
// typing `@` opens a typed file/folder picker that inserts an `@path` pointer
// token. Keeper omits the source and the composer behaves exactly as before.

import { useEffect, useRef, useState } from "react";
import { MODEL_TIERS, MODEL_TIER_INFO } from "./model-tiers";
import type { ModelTier } from "./keeper-types";
import type { MentionEntry, PiModel, PiThinkingLevel } from "../lib/cli";
import { PI_THINKING_LEVELS } from "../lib/cli";
import { getMentionState, insertMention, type MentionState } from "./mentions";
import { cn } from "../lib/cn";
import { useToast } from "../toast/toast-context";

// Short badge + affordance per entry kind for the mention menu rows.
const MENTION_KIND_LABEL: Record<MentionEntry["kind"], string> = {
  file: "file",
  folder: "folder",
  "code-repo": "repo",
  "ideaspace-repo": "ideaspace",
};

// Display labels for the local (Pi) thinking-level picker. "" is Auto (send no
// flag → pi keeps the model/session default); the rest are pi's graded levels.
const THINKING_OPTIONS: { value: PiThinkingLevel | ""; label: string }[] = [
  { value: "", label: "Auto" },
  ...PI_THINKING_LEVELS.map((l) => ({
    value: l,
    label: l === "xhigh" ? "X-High" : l.charAt(0).toUpperCase() + l.slice(1),
  })),
];

// OS arg-length cap on the CLI's `--message` (see lib/cli.ts). macOS ARG_MAX is
// ~256 KB shared across all args; keep a safe ceiling well under it.
const MAX_MESSAGE_CHARS = 100_000;

export interface SendOptions {
  modelTier: ModelTier;
  thinking: boolean;
  /** Local (Pi) only — the chosen `pi-models` ref, when the local picker is shown.
   *  Undefined for Keeper (which uses `modelTier`) and when no models are loaded. */
  model?: string;
  /** Local (Pi) only — a graded thinking level for the picked model. Undefined =
   *  Auto (pi's default) or a non-reasoning model (the control is hidden). */
  thinkingLevel?: PiThinkingLevel;
}

export function Compose({
  onSend,
  onStop,
  streaming,
  disabled = false,
  placeholder = "Ask Keeper…",
  showModelControls = true,
  models,
  initialModel,
  initialThinkingLevel,
  mentionSource,
}: {
  onSend: (text: string, opts: SendOptions) => void;
  onStop: () => void;
  streaming: boolean;
  disabled?: boolean;
  /** Prompt text. Defaults to the Keeper copy; the local Pi surface passes its own. */
  placeholder?: string;
  /** The Keeper model-tier picker + Think toggle. */
  showModelControls?: boolean;
  /** Local (Pi) models for the picker. When non-empty a model `<select>` renders
   *  and the chosen ref rides on `SendOptions.model`. Keeper omits this. */
  models?: PiModel[];
  /** Seed the local picker with this ref (when valid) instead of the first model
   *  — e.g. an opened conversation inherits the model picked at its start. */
  initialModel?: string;
  /** Seed the thinking picker with this level — the level round-trips the same
   *  way {@link initialModel} does, so a continued conversation keeps it. */
  initialThinkingLevel?: PiThinkingLevel;
  /** Local (Pi) only — resolves @-mention candidates for a query. When provided,
   *  typing `@` opens the file/folder picker. Keeper omits it (no @-mentions). */
  mentionSource?: (query: string) => Promise<MentionEntry[]>;
}) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [modelTier, setModelTier] = useState<ModelTier>("sonnet");
  const [thinking, setThinking] = useState(false);
  const [model, setModel] = useState<string | undefined>(undefined);
  // Local (Pi) thinking level. "" = Auto (send no flag). Only sent for a
  // reasoning-capable model; the control is hidden otherwise.
  const [thinkingLevel, setThinkingLevel] = useState<PiThinkingLevel | "">("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Whether the picked local model can reason — gates the thinking control. A
  // non-reasoning model hides it, and its level is never sent.
  const canThink = !!models?.find((m) => m.ref === model)?.reasoning;

  // Default the local picker, keeping a valid current selection across (re)loads:
  // keep the user's pick if still present, else the seed (initialModel), else the
  // first model. So an opened conversation starts on the model picked at its start.
  useEffect(() => {
    if (!models || models.length === 0) return;
    const has = (ref?: string) => !!ref && models.some((m) => m.ref === ref);
    setModel((cur) => (has(cur) ? cur : has(initialModel) ? initialModel : models[0].ref));
  }, [models, initialModel]);

  // Seed the thinking level from the conversation's start (mirrors initialModel).
  // Fires once per distinct seed; a later user change isn't clobbered since the
  // stable prop keeps the dep unchanged.
  useEffect(() => {
    if (initialThinkingLevel) setThinkingLevel(initialThinkingLevel);
  }, [initialThinkingLevel]);

  // Auto-grow the textarea with its content, up to a max height.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [text]);

  // --- @-mention menu (local Pi only; inert without a mentionSource) ---
  // `menu` holds the trigger state + resolved candidates + the highlighted row.
  const [menu, setMenu] = useState<{ state: MentionState; items: MentionEntry[]; active: number } | null>(null);
  const mentionTimer = useRef<number | undefined>(undefined);
  const mentionReq = useRef(0); // guards against out-of-order async results

  // Recompute the mention menu for the current value+caret. Debounced fetch; a
  // stale response (query moved on) is dropped via the request token.
  const refreshMenu = (value: string, caret: number | null): void => {
    if (!mentionSource) return;
    const state = getMentionState(value, caret);
    if (!state) {
      setMenu(null);
      return;
    }
    const req = ++mentionReq.current;
    if (mentionTimer.current) window.clearTimeout(mentionTimer.current);
    mentionTimer.current = window.setTimeout(() => {
      void mentionSource(state.query)
        .then((items) => {
          if (mentionReq.current !== req) return; // superseded by a newer keystroke
          setMenu(items.length ? { state, items, active: 0 } : null);
        })
        .catch(() => {
          if (mentionReq.current === req) setMenu(null);
        });
    }, 120);
  };

  const closeMenu = (): void => {
    mentionReq.current++; // invalidate any in-flight fetch
    setMenu(null);
  };

  // Insert the chosen entry as an `@path` token and restore the caret after it.
  // Recompute the trigger from the LIVE text+caret (not the menu's captured
  // state, which can lag the last keystroke by the debounce window), so the
  // replacement always targets what's actually under the cursor.
  const chooseMention = (entry: MentionEntry): void => {
    const ta = taRef.current;
    const state = getMentionState(text, ta ? ta.selectionStart : null);
    if (!state) {
      closeMenu();
      return;
    }
    const { value, cursor } = insertMention(text, state, entry);
    setText(value);
    closeMenu();
    requestAnimationFrame(() => {
      if (ta) {
        ta.focus();
        ta.setSelectionRange(cursor, cursor);
      }
    });
  };

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || streaming || disabled) return;
    if (trimmed.length > MAX_MESSAGE_CHARS) {
      toast(`Message is too long (max ${MAX_MESSAGE_CHARS.toLocaleString()} characters).`, "error");
      return;
    }
    onSend(trimmed, {
      modelTier,
      thinking,
      model,
      // Only a reasoning model with an explicit (non-Auto) level sends one.
      thinkingLevel: canThink && thinkingLevel ? thinkingLevel : undefined,
    });
    setText("");
  };

  // The standalone Think toggle pill. The model-tier radios use a sibling
  // variant inline (tighter padding); not a shared base, so named for its one use.
  const togglePill =
    "rounded px-2 py-1 font-chrome text-[11px] uppercase tracking-[0.04em] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-is-focus-ring disabled:opacity-50";

  return (
    // No card here — the parent ComposerShell owns the border/background so the
    // workspace strip above shares the same opaque container (is_web parity).
    <div className="p-3.5">
      <div className="relative">
        {menu && (
          // Anchored above the textarea (the composer sits at the bottom of the
          // view). Rows are chosen on mousedown so the textarea never blurs.
          <ul
            role="listbox"
            aria-label="Mention a file or folder"
            className="absolute bottom-full left-0 z-20 mb-1 max-h-64 w-full max-w-md overflow-y-auto rounded-md border border-is-border bg-is-surface py-1 shadow-lg"
          >
            {menu.items.map((item, i) => (
              <li
                key={item.path}
                role="option"
                aria-selected={i === menu.active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  chooseMention(item);
                }}
                onMouseEnter={() => setMenu((m) => (m ? { ...m, active: i } : m))}
                className={cn(
                  "flex cursor-pointer items-baseline gap-2 px-3 py-1.5 font-chrome text-sm",
                  i === menu.active ? "bg-is-surface-alt text-is-text" : "text-is-text-secondary",
                )}
              >
                <span className="truncate">{item.name}</span>
                <span className="ml-auto shrink-0 rounded bg-is-surface-alt px-1.5 py-0.5 text-[10px] uppercase tracking-[0.04em] text-is-text-tertiary">
                  {MENTION_KIND_LABEL[item.kind]}
                </span>
                <span className="w-full shrink truncate text-[11px] text-is-text-tertiary">{item.path}</span>
              </li>
            ))}
          </ul>
        )}
        <textarea
          ref={taRef}
          rows={1}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            refreshMenu(e.target.value, e.target.selectionStart);
          }}
          onKeyDown={(e) => {
            if (menu) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setMenu((m) => (m ? { ...m, active: (m.active + 1) % m.items.length } : m));
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setMenu((m) => (m ? { ...m, active: (m.active - 1 + m.items.length) % m.items.length } : m));
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                chooseMention(menu.items[menu.active]);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                closeMenu();
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          onBlur={() => closeMenu()}
          placeholder={placeholder}
          aria-label="Message"
          disabled={disabled}
          className="block max-h-[200px] min-h-[3.5rem] w-full resize-none bg-transparent font-chrome text-sm leading-relaxed text-is-text outline-none placeholder:text-is-text-tertiary disabled:opacity-60"
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        {showModelControls && (
          <>
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
                togglePill,
                thinking
                  ? "bg-is-text text-is-bg"
                  : "bg-is-surface-alt text-is-text-tertiary hover:text-is-text",
              )}
            >
              think
            </button>
          </>
        )}
        {models && models.length > 0 && (
          // Local (Pi) model picker. A native <select>, not the Keeper segments:
          // there can be dozens of models, so a dropdown is the honest fit. The
          // chosen ref rides on SendOptions.model.
          <select
            aria-label="Model"
            value={model ?? ""}
            onChange={(e) => setModel(e.target.value)}
            disabled={disabled}
            className="max-w-[12rem] rounded border border-is-border bg-is-surface-alt px-2 py-1 font-chrome text-[11px] text-is-text-secondary outline-none transition-colors hover:text-is-text focus-visible:ring-2 focus-visible:ring-is-focus-ring disabled:opacity-50"
          >
            {models.map((m) => (
              <option key={m.ref} value={m.ref}>
                {m.name}
                {m.reasoning ? " · thinking" : ""}
              </option>
            ))}
          </select>
        )}
        {canThink && (
          // Local (Pi) thinking level — shown only for a reasoning-capable model,
          // graded (pi supports minimal→max, unlike Keeper's on/off). "Auto" sends
          // no flag so pi keeps the model default.
          <label className="flex items-center gap-1 font-chrome text-[11px] uppercase tracking-[0.04em] text-is-text-tertiary">
            <span>Think</span>
            <select
              aria-label="Thinking level"
              value={thinkingLevel}
              onChange={(e) => setThinkingLevel(e.target.value as PiThinkingLevel | "")}
              disabled={disabled}
              className="rounded border border-is-border bg-is-surface-alt px-2 py-1 font-chrome text-[11px] text-is-text-secondary outline-none transition-colors hover:text-is-text focus-visible:ring-2 focus-visible:ring-is-focus-ring disabled:opacity-50"
            >
              {THINKING_OPTIONS.map((o) => (
                <option key={o.value || "auto"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
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
