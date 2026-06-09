import { Monitor, Moon, Sun } from "lucide-react";
import type { ThemeMode } from "../theme/useTheme";

const OPTIONS: { mode: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { mode: "light", label: "Light", Icon: Sun },
  { mode: "system", label: "System", Icon: Monitor },
  { mode: "dark", label: "Dark", Icon: Moon },
];

export function ThemeToggle({
  mode,
  setMode,
}: {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-is-border bg-is-surface p-0.5">
      {OPTIONS.map(({ mode: m, label, Icon }) => (
        <button
          key={m}
          type="button"
          aria-label={label}
          aria-pressed={mode === m}
          onClick={() => setMode(m)}
          className={
            "rounded-md p-1.5 transition " +
            (mode === m
              ? "bg-is-surface-alt text-is-text"
              : "text-is-text-tertiary hover:text-is-text")
          }
        >
          <Icon size={16} strokeWidth={1.333} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
