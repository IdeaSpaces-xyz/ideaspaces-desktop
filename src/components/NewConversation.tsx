import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ArrowLeft, Check, ChevronsUpDown, FolderGit2 } from "lucide-react";
import { createConversation, type Space } from "../lib/cli";
import type { ConversationRow } from "../spaces/useConversations";
import { useToast } from "../toast/toast-context";
import { Compose } from "../conversation/Compose";

// The draft for a new conversation: pick a context repo (the agent's point of
// view) and send the first message. Nothing exists server-side until that first
// send — `createConversation` binds the repo, then the parent hands off to the
// live ConversationDetail (which auto-sends the message). The context picker is
// only here, in the draft; once created the repo is locked (no picker on a real
// conversation), exactly the "locked at first message" decision.
export function NewConversation({
  repos,
  onBack,
  onCreated,
}: {
  repos: Space[];
  onBack: () => void;
  onCreated: (row: ConversationRow, firstMessage: string) => void;
}) {
  const toast = useToast();
  // Single-repo contexts have no real choice — preselect it.
  const [repoId, setRepoId] = useState(repos.length === 1 ? repos[0].repo_id : "");
  const [busy, setBusy] = useState(false);
  const chosen = repos.find((r) => r.repo_id === repoId);

  const send = async (text: string) => {
    if (busy || !repoId) return;
    setBusy(true);
    try {
      const created = await createConversation(repoId);
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
      );
      // Parent unmounts this (creating → false) on handoff; no need to reset busy.
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-6">
      <header className="shrink-0 pb-3 pt-6">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1 text-xs text-is-text-tertiary transition hover:text-is-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
        >
          <ArrowLeft size={14} strokeWidth={1.333} aria-hidden="true" />
          Conversations
        </button>
        <h2 className="text-lg font-medium text-is-text">New conversation</h2>
        <div className="mt-2 flex items-center gap-2 text-xs text-is-text-tertiary">
          <span>Context</span>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                disabled={busy}
                className="flex min-w-0 items-center gap-1.5 rounded-md border border-is-border px-2 py-1 text-xs text-is-text transition-colors hover:bg-is-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring disabled:opacity-50 data-[state=open]:bg-is-surface-alt"
              >
                <FolderGit2 size={14} strokeWidth={1.333} className="shrink-0 text-is-text-secondary" />
                <span className="truncate">{chosen ? chosen.slug : "Select a repo"}</span>
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
                  Context repo
                </DropdownMenu.Label>
                {repos.map((r) => (
                  <DropdownMenu.Item
                    key={r.repo_id}
                    onSelect={() => setRepoId(r.repo_id)}
                    className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-xs text-is-text outline-none transition-colors data-[highlighted]:bg-is-surface-alt"
                  >
                    <FolderGit2 size={14} strokeWidth={1.333} className="shrink-0 text-is-text-secondary" />
                    <span className="flex-1 truncate">{r.slug}</span>
                    {r.repo_id === repoId && (
                      <Check size={14} strokeWidth={1.5} className="shrink-0 text-is-text" />
                    )}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="max-w-sm text-sm text-is-text-tertiary">
          {repoId
            ? "Send the first message. The context repo is the agent's point of view, and locks once the conversation starts."
            : "Pick a context repo above — the agent's point of view — to begin."}
        </p>
      </div>

      <Compose onSend={(t) => void send(t)} onStop={() => {}} streaming={false} disabled={busy || !repoId} />
    </div>
  );
}
