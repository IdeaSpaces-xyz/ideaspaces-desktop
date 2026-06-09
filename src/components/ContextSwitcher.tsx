import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Building2, Check, ChevronsUpDown, User } from "lucide-react";
import { cn } from "../lib/cn";
import type { SpaceContext } from "../lib/space-context";

// Global Personal / org switcher in the header. Ported from is_web's /v2 TopBar.
export function ContextSwitcher({
  contexts,
  activeContext,
  onSelect,
}: {
  contexts: SpaceContext[];
  activeContext: SpaceContext | null;
  onSelect: (ref: string) => void;
}) {
  if (!activeContext) return null;

  // Single context (Personal only, no orgs) → static label, no menu.
  if (contexts.length <= 1) {
    return (
      <span className="flex min-w-0 items-center gap-1.5 px-2 py-1 text-xs text-is-text">
        <ContextGlyph context={activeContext} />
        <span className={cn("truncate", activeContext.kind === "personal" && "lowercase")}>
          {activeContext.label}
        </span>
      </span>
    );
  }

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
                className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-xs text-is-text outline-none transition-colors data-[highlighted]:bg-is-surface-alt"
              >
                <ContextGlyph context={ctx} />
                <span className={cn("flex-1 truncate", ctx.kind === "personal" && "lowercase")}>
                  {ctx.label}
                </span>
                <DropdownMenu.ItemIndicator>
                  <Check size={14} strokeWidth={1.5} className="text-is-text" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ContextGlyph({ context }: { context: SpaceContext }) {
  const Icon = context.kind === "personal" ? User : Building2;
  return <Icon size={14} strokeWidth={1.333} className="shrink-0 text-is-text-secondary" />;
}
