import { useEffect, useState, type ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Bot, Check, ChevronsUpDown, FolderGit2 } from "lucide-react";
import { createConversation, listAgents, type Agent, type Space } from "../lib/cli";
import type { ConversationRow } from "../spaces/useConversations";
import { useToast } from "../toast/toast-context";
import { Compose, type SendOptions } from "../conversation/Compose";

// The draft for a new conversation: pick a context repo (the agent's point of
// view) + the agent, then send the first message. Nothing exists server-side
// until that first send — `createConversation` binds the repo (and agent), then
// the parent hands off to the live ConversationDetail (which auto-sends the
// message). The pickers are only here, in the draft; once created the repo is
// locked (the "locked at first message" decision). Mirrors is_web's
// NewConversationDraft: an inline block (repo + agent ChipPicker + composer) at
// the top of the conversation list, not a separate screen.
export function NewConversation({
  repos,
  onCreated,
}: {
  repos: Space[];
  onCreated: (row: ConversationRow, firstMessage: string, opts: SendOptions) => void;
}) {
  const toast = useToast();
  // Single-repo contexts have no real choice — preselect it.
  const [repoId, setRepoId] = useState(repos.length === 1 ? repos[0].repo_id : "");
  const [agentNodeId, setAgentNodeId] = useState("");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsNote, setAgentsNote] = useState<string | undefined>("Loading agents…");
  const [busy, setBusy] = useState(false);
  const chosen = repos.find((r) => r.repo_id === repoId);

  // Selectable agents (the caller's own — user-scoped, no Space). Only the
  // invokable ones; a failure leaves the picker showing "Default agent".
  useEffect(() => {
    let alive = true;
    listAgents()
      .then((list) => {
        if (!alive) return;
        const usable = list.filter((a) => a.can_use);
        setAgents(usable);
        setAgentsNote(usable.length ? undefined : "No agents available — the default will be used.");
      })
      .catch((err) => alive && setAgentsNote(err instanceof Error ? err.message : String(err)));
    return () => {
      alive = false;
    };
  }, []);

  // Explicit pick → the owner default → the first. Empty = let the server default.
  const effectiveAgentNodeId =
    agentNodeId || agents.find((a) => a.is_default)?.node_id || agents[0]?.node_id || "";
  const chosenAgent = agents.find((a) => a.node_id === effectiveAgentNodeId);

  const send = async (text: string, opts: SendOptions) => {
    if (busy || !repoId) return;
    setBusy(true);
    try {
      const created = await createConversation(repoId, effectiveAgentNodeId || undefined);
      onCreated(
        {
          conversation_id: created.conversation_id,
          name: created.name || "New conversation",
          summary: "",
          message_count: 0,
          status: "active",
          updated_at: new Date().toISOString(),
          repoId,
          repoSlug: chosen?.slug ?? repoId,
        },
        text,
        opts,
      );
      // Parent unmounts this (creating → false) on handoff; no need to reset busy.
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
      setBusy(false);
    }
  };

  return (
    <section aria-label="Start a conversation" className="mb-10">
      <div className="mb-2 flex flex-wrap items-center gap-2">
          <ChipPicker
            ariaLabel="Context repo"
            heading="Context repo"
            icon={<FolderGit2 size={13} strokeWidth={1.333} />}
            triggerLabel={chosen ? chosen.slug : "Select a repo"}
            value={repoId}
            onValueChange={setRepoId}
            disabled={busy}
            items={repos.map((r) => ({
              value: r.repo_id,
              label: r.slug,
              icon: <FolderGit2 size={14} strokeWidth={1.333} className="shrink-0 text-is-text-secondary" />,
            }))}
          />
          <ChipPicker
            ariaLabel="Agent"
            heading="Agent"
            icon={<Bot size={13} strokeWidth={1.333} />}
            triggerLabel={chosenAgent ? chosenAgent.name : "Default agent"}
            value={effectiveAgentNodeId}
            onValueChange={setAgentNodeId}
            disabled={busy}
            items={agents.map((a) => ({
              value: a.node_id,
              label: `${a.name}${a.is_default ? " (default)" : ""}`,
              icon: <Bot size={14} strokeWidth={1.333} className="shrink-0 text-is-text-secondary" />,
            }))}
            footer={agentsNote ? <Note>{agentsNote}</Note> : undefined}
          />
        </div>
      <div className="rounded-2xl border border-is-border bg-is-surface">
        <Compose
          onSend={(t, opts) => void send(t, opts)}
          onStop={() => {}}
          streaming={false}
          disabled={busy || !repoId}
        />
      </div>
      {!repoId && (
        <p className="mt-2 font-chrome text-[11px] text-is-text-tertiary">
          Pick a context repo above to begin — the agent’s point of view, locked once the conversation starts.
        </p>
      )}
    </section>
  );
}

// A pill-trigger dropdown picker (Radix RadioGroup), ported from is_web's
// ChipPicker. Used for both the repo and agent selectors in the draft header.
function ChipPicker({
  icon,
  triggerLabel,
  ariaLabel,
  heading,
  value,
  onValueChange,
  items,
  footer,
  disabled,
}: {
  icon: ReactNode;
  triggerLabel: string;
  ariaLabel: string;
  heading: string;
  value: string;
  onValueChange: (value: string) => void;
  items: { value: string; label: string; icon?: ReactNode }[];
  footer?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`${ariaLabel}: ${triggerLabel}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-is-border bg-is-surface px-2 py-1 font-chrome text-[11px] text-is-text transition-colors hover:bg-is-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring disabled:opacity-50 data-[state=open]:bg-is-surface-alt"
        >
          <span className="shrink-0 text-is-text-secondary">{icon}</span>
          <span className="max-w-[160px] truncate">{triggerLabel}</span>
          <ChevronsUpDown size={12} strokeWidth={1.333} className="shrink-0 text-is-text-tertiary" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-30 max-h-[60vh] min-w-[200px] overflow-y-auto rounded-lg border border-is-border bg-is-surface py-1 shadow-lg"
        >
          <DropdownMenu.Label className="px-3 py-1.5 font-chrome text-[10px] uppercase tracking-[0.08em] text-is-text-tertiary">
            {heading}
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={value} onValueChange={onValueChange}>
            {items.map((item) => (
              <DropdownMenu.RadioItem
                key={item.value}
                value={item.value}
                className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 font-chrome text-xs text-is-text outline-none transition-colors data-[highlighted]:bg-is-surface-alt"
              >
                {item.icon}
                <span className="flex-1 truncate">{item.label}</span>
                <DropdownMenu.ItemIndicator>
                  <Check size={14} strokeWidth={1.5} className="text-is-text" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          {footer}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="px-3 py-1.5 font-chrome text-[11px] text-is-text-tertiary">{children}</p>;
}
