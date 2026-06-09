import { useCallback, useEffect, useRef, useState } from "react";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { cn } from "../lib/cn";
import type { ThemeMode } from "../theme/useTheme";

// User menu dropdown in the header — identity, theme picker, sign out. Ported
// from is_web's shell/UserMenu (settings/billing links dropped; no routes yet).
export function UserMenu({
  username,
  mode,
  setMode,
  onSignOut,
  signingOut,
}: {
  username?: string;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  const label = username ? `@${username}` : "Account";
  const initial = (username ?? "u").slice(0, 1).toUpperCase();

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open user menu"
        className="inline-flex h-11 items-center gap-2 rounded-lg bg-transparent py-1.5 pl-1.5 pr-3 font-chrome text-[14px] text-is-text-secondary transition hover:bg-is-surface-alt"
      >
        <span
          aria-hidden="true"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-is-border bg-is-surface-alt font-chrome text-[12px] font-medium text-is-text"
        >
          {initial}
        </span>
        <span className="max-w-[10rem] truncate">{label}</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label="User menu"
          onBlur={(e) => {
            const next = e.relatedTarget as Node | null;
            if (!next || !panelRef.current?.contains(next)) setOpen(false);
          }}
          className="absolute right-0 top-full z-40 mt-1 w-56 rounded-lg border border-is-border bg-is-surface py-1 shadow-lg"
        >
          <div className="border-b border-is-border px-3 py-2 text-xs text-is-text-tertiary">
            <p className="truncate text-is-text-secondary">{label}</p>
          </div>

          <ThemePicker mode={mode} setMode={setMode} />

          <div className="mt-1 border-t border-is-border pt-1">
            <button
              type="button"
              role="menuitem"
              disabled={signingOut}
              onClick={() => {
                onSignOut();
                close();
              }}
              className="flex h-11 w-full items-center px-3 text-left text-sm text-is-text hover:bg-is-surface-alt disabled:opacity-50"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; Icon: LucideIcon }> = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "system", label: "System", Icon: Monitor },
  { value: "dark", label: "Dark", Icon: Moon },
];

function ThemePicker({
  mode,
  setMode,
}: {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}) {
  return (
    <div role="group" aria-label="Theme" className="px-3 pb-2 pt-2">
      <p className="mb-1.5 text-xs text-is-text-tertiary">Theme</p>
      <div className="grid grid-cols-3 gap-1 rounded-md border border-is-border p-0.5">
        {THEME_OPTIONS.map(({ value, label, Icon }) => {
          const selected = mode === value;
          return (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={selected}
              aria-label={label}
              title={label}
              onClick={() => setMode(value)}
              className={cn(
                "inline-flex h-7 items-center justify-center rounded text-is-text-secondary hover:text-is-text",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring",
                selected && "bg-is-surface-alt text-is-text",
              )}
            >
              <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
