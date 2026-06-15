import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronsUpDown, FolderGit2 } from "lucide-react";
import type { CloneRecord } from "../lib/cli";

// Quick repo jump in the header, beside the context switcher — hop straight
// between your cloned (editable) repos without going back to the list. The
// trigger shows the open repo (or "Open a repo" when none is open).
export function RepoSwitcher({
  clones,
  activeRepoId,
  onSelect,
}: {
  clones: CloneRecord[];
  activeRepoId: string | undefined;
  onSelect: (clone: CloneRecord) => void;
}) {
  if (clones.length === 0) return null;
  const active = clones.find((c) => c.repo_id === activeRepoId);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-is-text transition-colors hover:bg-is-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring data-[state=open]:bg-is-surface-alt"
        >
          <FolderGit2 size={14} strokeWidth={1.333} className="shrink-0 text-is-text-secondary" />
          <span className="truncate">{active ? active.slug : "Open a repo"}</span>
          <ChevronsUpDown size={13} strokeWidth={1.333} className="text-is-text-tertiary" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-30 max-h-[60vh] min-w-[200px] overflow-y-auto overflow-x-hidden rounded-lg border border-is-border bg-is-surface py-1 shadow-lg"
        >
          <DropdownMenu.Label className="px-3 py-1.5 font-chrome text-[10px] uppercase tracking-[0.08em] text-is-text-tertiary">
            Jump to repo
          </DropdownMenu.Label>
          {clones.map((clone) => (
            <DropdownMenu.Item
              key={clone.repo_id}
              onSelect={() => onSelect(clone)}
              className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-xs text-is-text outline-none transition-colors data-[highlighted]:bg-is-surface-alt"
            >
              <FolderGit2 size={14} strokeWidth={1.333} className="shrink-0 text-is-text-secondary" />
              <span className="flex-1 truncate">{clone.slug}</span>
              {clone.repo_id === activeRepoId && (
                <Check size={14} strokeWidth={1.5} className="shrink-0 text-is-text" />
              )}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
