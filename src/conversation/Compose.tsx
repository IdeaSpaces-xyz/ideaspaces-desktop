// The chat compose box — v2 look: textarea on top and a controls row beneath
// (model tier + Think toggle on the left, Send / Stop on the right). Rendered
// inside ComposerShell, which owns the card chrome (border/background) so the
// workspace strip can share it. Owns its draft + model-tier + thinking state and hands a trimmed
// message plus the chosen options to `onSend`.
//
// @-mentions are opt-in: when `mentionSource` is provided (the local Pi surface),
// typing `@` opens a typed file/folder picker that inserts an `@path` pointer
// token. Keeper omits the source and the composer behaves exactly as before.

import { useEffect, useMemo, useRef, useState } from "react";
import { MODEL_TIERS, MODEL_TIER_INFO } from "./model-tiers";
import type { ModelTier } from "./keeper-types";
import type { MentionEntry, PiModel, PiThinkingLevel } from "../lib/cli";
import { PI_THINKING_LEVELS } from "../lib/cli";
import { usePiHiddenModels, visibleModels, collapseSnapshots, groupByProvider } from "../pi/model-prefs";
import { labelFor } from "../pi/providers";
import { getMentionState, insertMention, type MentionState } from "./mentions";
import { cn } from "../lib/cn";
import { useToast } from "../toast/toast-context";

// Row badge label per entry kind. Only repo/ideaspace kinds are badged in the
// menu (like Keeper badges only a "perspective") — plain file/folder read from
// the path alone.
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

  // Model curation: the picker shows only models the user hasn't hidden (in Pi
  // settings). Memoized so its identity is stable for the selection effect below.
  const { hidden } = usePiHiddenModels();
  // Collapse duplicate dated snapshots, then apply curation. Grouped by provider
  // for the picker's <optgroup> headers.
  const shownModels = useMemo(
    () => (models ? visibleModels(collapseSnapshots(models), hidden) : undefined),
    [models, hidden],
  );
  const modelGroups = useMemo(() => (shownModels ? groupByProvider(shownModels) : []), [shownModels]);

  // Whether the picked local model can reason — gates the thinking control. A
  // non-reasoning model hides it, and its level is never sent.
  const canThink = !!shownModels?.find((m) => m.ref === model)?.reasoning;

  // Default the local picker, keeping a valid current selection across (re)loads:
  // keep the user's pick if still shown, else the seed (initialModel), else the
  // first shown model. So an opened conversation starts on the model picked at its
  // start, and hiding the selected model falls back to a visible one.
  useEffect(() => {
    if (!shownModels || shownModels.length === 0) return;
    const has = (ref?: string) => !!ref && shownModels.some((m) => m.ref === ref);
    setModel((cur) => (has(cur) ? cur : has(initialModel) ? initialModel : shownModels[0].ref));
  }, [shownModels, initialModel]);

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
  // `loading` shows Keeper's "Searching…" while the lookup runs (menu opens on
  // `@` immediately, not only once results arrive).
  const [menu, setMenu] = useState<{
    state: MentionState;
    items: MentionEntry[];
    active: number;
    loading: boolean;
  } | null>(null);
  const mentionTimer = useRef<number | undefined>(undefined);
  const mentionReq = useRef(0); // guards against out-of-order async results
  const mentionErrShown = useRef(false); // toast a lookup failure once, not per keystroke

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
    // Open immediately in a loading state so `@` feels responsive while ls runs.
    setMenu({ state, items: [], active: 0, loading: true });
    if (mentionTimer.current) window.clearTimeout(mentionTimer.current);
    mentionTimer.current = window.setTimeout(() => {
      void mentionSource(state.query)
        .then((items) => {
          if (mentionReq.current !== req) return; // superseded by a newer keystroke
          mentionErrShown.current = false; // recovered — let a later failure toast again
          // Loaded: show matches, or close if there are none (matches Keeper).
          setMenu(items.length ? { state, items, active: 0, loading: false } : null);
        })
        .catch((err) => {
          if (mentionReq.current === req) setMenu(null);
          // Don't swallow it silently — a failing lookup (e.g. a stale CLI with
          // no `ls`) otherwise reads as "@ does nothing". Log every time for
          // devtools; toast once so the user sees it without per-keystroke spam.
          console.error("@-mention lookup failed:", err);
          if (!mentionErrShown.current) {
            mentionErrShown.current = true;
            toast("Couldn't load files for @-mention.", "error");
          }
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
          // view). Aligned to Keeper's mention menu (is_web): two-line rows —
          // `@ name` (+ a badge for repo/ideaspace) over the path — and a
          // "Searching…" state. Rows are chosen on mousedown so the textarea
          // never blurs.
          <div className="absolute inset-x-0 bottom-full z-20 mb-2 overflow-hidden rounded-lg border border-is-border bg-is-surface shadow-[0_1px_2px_rgba(18,20,26,0.06),0_8px_24px_rgba(18,20,26,0.08)]">
            {menu.loading && menu.items.length === 0 ? (
              <p className="px-3 py-2 font-chrome text-xs text-is-text-tertiary">Searching…</p>
            ) : (
              <ul role="listbox" aria-label="Mention a file or folder" className="max-h-64 overflow-y-auto py-1">
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
                      "flex cursor-pointer flex-col gap-0.5 px-3 py-2 transition-colors",
                      i === menu.active ? "bg-is-surface-alt" : "hover:bg-is-surface-alt",
                    )}
                  >
                    <span className="flex items-center gap-1.5 font-chrome text-sm text-is-text">
                      <span className="text-is-text-tertiary">@</span>
                      <span className="truncate">{item.name}</span>
                      {(item.kind === "code-repo" || item.kind === "ideaspace-repo") && (
                        <span className="shrink-0 rounded border border-is-border px-1 py-px text-[9px] uppercase tracking-[0.06em] text-is-text-tertiary">
                          {MENTION_KIND_LABEL[item.kind]}
                        </span>
                      )}
                    </span>
                    <span className="truncate font-chrome text-[11px] text-is-text-tertiary">{item.path}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
              if (e.key === "Escape") {
                e.preventDefault();
                closeMenu();
                return;
              }
              // Navigation/selection only once results are in (not while loading).
              if (menu.items.length > 0) {
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
        {shownModels && shownModels.length > 0 && (
          // Local (Pi) model picker. A native <select>, not the Keeper segments:
          // there can be dozens of models, so a dropdown is the honest fit. Grouped
          // by provider, dated-snapshot duplicates collapsed, and curated (Pi
          // settings) models hidden. The chosen ref rides on SendOptions.model.
          <select
            aria-label="Model"
            value={model ?? ""}
            onChange={(e) => setModel(e.target.value)}
            disabled={disabled}
            className="max-w-[12rem] rounded border border-is-border bg-is-surface-alt px-2 py-1 font-chrome text-[11px] text-is-text-secondary outline-none transition-colors hover:text-is-text focus-visible:ring-2 focus-visible:ring-is-focus-ring disabled:opacity-50"
          >
            {modelGroups.map(([provider, group]) => (
              <optgroup key={provider} label={labelFor(provider)}>
                {group.map((m) => (
                  <option key={m.ref} value={m.ref}>
                    {m.name}
                    {m.reasoning ? " · thinking" : ""}
                  </option>
                ))}
              </optgroup>
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
