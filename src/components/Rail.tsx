import { FolderGit2, MessageSquare, type LucideIcon } from "lucide-react";
import { cn } from "../lib/cn";

export type View = "repos" | "conversations";

const ITEMS: { key: View; label: string; Icon: LucideIcon }[] = [
  { key: "repos", label: "Repos", Icon: FolderGit2 },
  { key: "conversations", label: "Conversations", Icon: MessageSquare },
];

// Collapsible left rail, ported from is_web's /v2: narrow by default, expands on
// hover to reveal labels. View-state switching (no router).
export function Rail({ view, onSelect }: { view: View; onSelect: (view: View) => void }) {
  return (
    <aside className="group/rail flex w-14 shrink-0 flex-col border-r border-is-border bg-is-bg py-3 transition-[width] duration-200 ease-out hover:w-52">
      <nav className="flex flex-col gap-1 px-2">
        {ITEMS.map(({ key, label, Icon }) => {
          const active = view === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              aria-current={active ? "page" : undefined}
              title={label}
              className={cn(
                "flex items-center gap-3 rounded-md py-2 pl-2.5 font-chrome text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring",
                active
                  ? "bg-is-surface-alt text-is-text"
                  : "text-is-text-tertiary hover:bg-is-surface-alt hover:text-is-text",
              )}
            >
              <span className="flex w-[18px] shrink-0 items-center justify-center">
                <Icon size={18} strokeWidth={1.333} aria-hidden="true" />
              </span>
              <span className="overflow-hidden whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/rail:opacity-100 group-focus-within/rail:opacity-100">
                {label}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
