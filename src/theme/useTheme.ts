import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "is-theme";

function readStored(): ThemeMode {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  // `system` adds no class — `prefers-color-scheme` (via `:root:not(.light)`)
  // drives it. `.light` / `.dark` force a theme over the OS preference.
  if (mode === "light") root.classList.add("light");
  else if (mode === "dark") root.classList.add("dark");
}

/**
 * Theme controller: light / dark / system, persisted to localStorage and
 * applied as a class on <html>. The token CSS (src/index.css) reacts to the
 * class; `system` falls through to the OS via prefers-color-scheme.
 */
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(readStored);

  useEffect(() => {
    applyTheme(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  return { mode, setMode };
}
