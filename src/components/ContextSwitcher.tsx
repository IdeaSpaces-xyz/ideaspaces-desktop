import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Building2, Check, ChevronsUpDown, FolderOpen, FolderPlus, User, X } from "lucide-react";
import { cn } from "../lib/cn";
import type { SpaceContext } from "../lib/space-context";

// Global context switcher in the header — Personal / org accounts plus any
// accountless folders the user has opened, and an "Open folder…" action. Ported
// from is_web's /v2 TopBar, generalized for the local-first shell.
export function ContextSwitcher({
  contexts,
  activeContext,
  onSelect,
  onOpenFolder,
  onCloseFolder,
}: {
  contexts: SpaceContext[];
  activeContext: SpaceContext | null;
  onSelect: (ref: string) => void;
  /** Pick a folder to open as an accountless context. */
  onOpenFolder: () => void;
  /** Remove an opened folder from the list. */
  onCloseFolder: (ctx: SpaceContext) => void;
}) {
  if (!activeContext) return null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-is-text transition-colors hover:bg-is-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring data-[state=open]:bg-is-surface-alt"
        >
          <ContextGlyph context={activeContext} />
          <span className={cn("truncate", activeContext.kind === "personal" && "lowercase")}>
            {activeContext.label}
          </span>
          <ChevronsUpDown size={13} strokeWidth={1.333} className="text-is-text-tertiary" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-30 min-w-[200px] overflow-hidden rounded-lg border border-is-border bg-is-surface py-1 shadow-lg"
        >
          <DropdownMenu.Label className="px-3 py-1.5 font-chrome text-[10px] uppercase tracking-[0.08em] text-is-text-tertiary">
            Switch context
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={activeContext.ref} onValueChange={onSelect}>
            {contexts.map((ctx) => (
              <DropdownMenu.RadioItem
                key={ctx.ref}
                value={ctx.ref}
                className="group flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-xs text-is-text outline-none transition-colors data-[highlighted]:bg-is-surface-alt"
              >
                <ContextGlyph context={ctx} />
                <span className={cn("flex-1 truncate", ctx.kind === "personal" && "lowercase")}>
                  {ctx.label}
                </span>
                <DropdownMenu.ItemIndicator>
                  <Check size={14} strokeWidth={1.5} className="text-is-text" />
                </DropdownMenu.ItemIndicator>
                {ctx.kind === "folder" && (
                  // Remove this folder from the list. Stop the pointer/click from
                  // selecting the row or closing the menu — this is its own action.
                  <button
                    type="button"
                    aria-label={`Remove ${ctx.label}`}
                    title="Remove from list"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onCloseFolder(ctx);
                    }}
                    className="rounded p-0.5 text-is-text-tertiary opacity-0 transition hover:bg-is-surface hover:text-is-text focus-visible:opacity-100 group-data-[highlighted]:opacity-100"
                  >
                    <X size={12} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                )}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className="my-1 h-px bg-is-border" />
          <DropdownMenu.Item
            onSelect={onOpenFolder}
            className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-xs text-is-text outline-none transition-colors data-[highlighted]:bg-is-surface-alt"
          >
            <FolderPlus size={14} strokeWidth={1.333} className="shrink-0 text-is-text-secondary" />
            <span className="flex-1 truncate">Open folder…</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ContextGlyph({ context }: { context: SpaceContext }) {
  const Icon =
    context.kind === "personal" ? User : context.kind === "folder" ? FolderOpen : Building2;
  return <Icon size={14} strokeWidth={1.333} className="shrink-0 text-is-text-secondary" />;
}
