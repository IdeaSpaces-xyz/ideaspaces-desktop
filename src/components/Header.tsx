import { BrandLockup } from "./BrandLockup";
import { ContextSwitcher } from "./ContextSwitcher";
import { UserMenu } from "./UserMenu";
import type { SpaceContext } from "../lib/space-context";
import type { ThemeMode } from "../theme/useTheme";

// App top bar, ported from is_web's /v2 TopBar: brand lockup + global context
// switcher on the left, user menu (identity, theme, sign-out) on the right.
export function Header({
  contexts,
  activeContext,
  onSelectContext,
  username,
  mode,
  setMode,
  onSignOut,
  signingOut,
}: {
  contexts: SpaceContext[];
  activeContext: SpaceContext | null;
  onSelectContext: (ref: string) => void;
  username?: string;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  return (
    <header className="shrink-0 border-b border-is-border bg-is-bg px-4 py-3 font-chrome sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <BrandLockup compact />
          <span className="h-4 w-px shrink-0 bg-is-border" />
          <ContextSwitcher
            contexts={contexts}
            activeContext={activeContext}
            onSelect={onSelectContext}
          />
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <UserMenu
            username={username}
            mode={mode}
            setMode={setMode}
            onSignOut={onSignOut}
            signingOut={signingOut}
          />
        </div>
      </div>
    </header>
  );
}
