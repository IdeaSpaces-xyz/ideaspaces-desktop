import { ContextSwitcher } from "./ContextSwitcher";
import { LogoSymbol } from "./LogoSymbol";
import { RepoSwitcher } from "./RepoSwitcher";
import { UserMenu } from "./UserMenu";
import type { CloneRecord } from "../lib/cli";
import type { SpaceContext } from "../lib/space-context";
import type { ThemeMode } from "../theme/useTheme";

// App top bar: a slim mark + the global context switcher + a quick repo switcher
// on the left, user menu (identity, theme, sign-out) on the right. Just the logo
// — the stacked wordmark is for the sign-in screen; the bar stays thin.
export function Header({
  contexts,
  activeContext,
  onSelectContext,
  clones,
  activeRepoId,
  onSelectRepo,
  onHome,
  username,
  mode,
  setMode,
  onSignOut,
  signingOut,
}: {
  contexts: SpaceContext[];
  activeContext: SpaceContext | null;
  onSelectContext: (ref: string) => void;
  clones: CloneRecord[];
  activeRepoId?: string;
  onSelectRepo: (clone: CloneRecord) => void;
  /** Click the logo → back to the conversations home (closes the editor). */
  onHome: () => void;
  username?: string;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  return (
    <header className="shrink-0 border-b border-is-border bg-is-bg px-4 py-1.5 font-chrome sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            onClick={onHome}
            aria-label="Home"
            title="Home"
            className="inline-flex shrink-0 items-center rounded text-is-text transition hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
          >
            <LogoSymbol className="h-6 w-7" />
          </button>
          <span className="h-4 w-px shrink-0 bg-is-border" />
          <ContextSwitcher
            contexts={contexts}
            activeContext={activeContext}
            onSelect={onSelectContext}
          />
          {clones.length > 0 && (
            <>
              <span className="h-4 w-px shrink-0 bg-is-border" />
              <RepoSwitcher clones={clones} activeRepoId={activeRepoId} onSelect={onSelectRepo} />
            </>
          )}
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
