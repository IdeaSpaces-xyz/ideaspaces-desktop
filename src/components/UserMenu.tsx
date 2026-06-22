import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { cn } from "../lib/cn";
import type { ThemeMode } from "../theme/useTheme";
import { useUpdater } from "../updater/updater-context";

// User menu in the header — identity, theme picker, sign out. Radix-backed
// (matching ContextSwitcher) so keyboard nav / focus management come for free.
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
  const label = username ? `@${username}` : "Account";
  const initial = (username ?? "u").slice(0, 1).toUpperCase();
  const updater = useUpdater();
  const checking = updater.status.phase === "checking";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Open user menu"
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-transparent py-1.5 pl-1.5 pr-3 font-chrome text-[14px] text-is-text-secondary transition hover:bg-is-surface-alt data-[state=open]:bg-is-surface-alt"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-is-border bg-is-surface-alt font-chrome text-[12px] font-medium text-is-text"
          >
            {initial}
          </span>
          <span className="max-w-[10rem] truncate">{label}</span>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-40 w-56 overflow-hidden rounded-lg border border-is-border bg-is-surface py-1 shadow-lg"
        >
          <DropdownMenu.Label className="truncate border-b border-is-border px-3 py-2 text-xs text-is-text-secondary">
            {label}
          </DropdownMenu.Label>

          <div role="group" aria-label="Theme" className="px-3 pb-2 pt-2">
            <p className="mb-1.5 text-xs text-is-text-tertiary">Theme</p>
            <DropdownMenu.RadioGroup
              value={mode}
              onValueChange={(value) => setMode(value as ThemeMode)}
              className="grid grid-cols-3 gap-1 rounded-md border border-is-border p-0.5"
            >
              {THEME_OPTIONS.map(({ value, label: themeLabel, Icon }) => (
                <DropdownMenu.RadioItem
                  key={value}
                  value={value}
                  aria-label={themeLabel}
                  title={themeLabel}
                  // Closing on theme change is jarring while comparing themes.
                  onSelect={(e) => e.preventDefault()}
                  className={cn(
                    "inline-flex h-7 cursor-pointer items-center justify-center rounded text-is-text-secondary outline-none hover:text-is-text",
                    "data-[highlighted]:text-is-text data-[state=checked]:bg-is-surface-alt data-[state=checked]:text-is-text",
                  )}
                >
                  <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
                </DropdownMenu.RadioItem>
              ))}
            </DropdownMenu.RadioGroup>
          </div>

          <DropdownMenu.Separator className="my-1 h-px bg-is-border" />

          <DropdownMenu.Item
            disabled={checking}
            // Keep the menu open while the check runs so its result (the "up to
            // date" toast or the update banner) lands with the menu still there.
            onSelect={(e) => {
              e.preventDefault();
              updater.checkForUpdates();
            }}
            className="flex h-11 cursor-pointer items-center px-3 text-sm text-is-text outline-none data-[highlighted]:bg-is-surface-alt data-[disabled]:opacity-50"
          >
            {checking ? "Checking…" : "Check for updates"}
          </DropdownMenu.Item>

          <DropdownMenu.Item
            disabled={signingOut}
            onSelect={onSignOut}
            className="flex h-11 cursor-pointer items-center px-3 text-sm text-is-text outline-none data-[highlighted]:bg-is-surface-alt data-[disabled]:opacity-50"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; Icon: LucideIcon }> = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "system", label: "System", Icon: Monitor },
  { value: "dark", label: "Dark", Icon: Moon },
];
