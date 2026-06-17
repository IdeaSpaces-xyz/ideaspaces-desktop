import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Bot, FolderGit2, Lock, Plus, User, X } from "lucide-react";
import {
  addConversationParticipant,
  listConversationParticipants,
  removeConversationParticipant,
  type Participant,
} from "../lib/cli";
import { useToast } from "../toast/toast-context";

// The open conversation's assembly row — the locked frame (context repo + agent,
// fixed when the conversation started) plus its people (add / remove). Ported
// from is_web's ConversationAssembly, trimmed to what the desktop backend allows
// today: agent discovery and add-a-repo (context mounts) are Space-gated, so the
// agent shows as a read-only chip and repo-mounts are omitted.

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function ConversationAssembly({
  repoId,
  conversationId,
  repoLabel,
  username,
}: {
  repoId: string;
  conversationId: string;
  repoLabel: string;
  username: string;
}) {
  const toast = useToast();
  const [participants, setParticipants] = useState<Participant[] | null>(null);
  // Roster read is participant-gated; a 403 (legacy/ownerless, or a conversation
  // you can see listed but aren't in) hides the people half, not the whole row.
  const [rosterError, setRosterError] = useState(false);
  // Per-principal in-flight removals (a Set, so two quick ✕ clicks don't race).
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      setParticipants(await listConversationParticipants(repoId, conversationId));
      setRosterError(false);
    } catch {
      setRosterError(true);
    }
  }, [repoId, conversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const agents = (participants ?? []).filter((p) => p.participant.startsWith("agent:"));
  // `node:` is the owner's person node — treat it (and `person:`) as people.
  const people = (participants ?? []).filter(
    (p) => p.participant.startsWith("person:") || p.participant.startsWith("node:"),
  );

  const removePerson = useCallback(
    async (participant: string) => {
      setBusyIds((s) => new Set(s).add(participant));
      try {
        await removeConversationParticipant(repoId, conversationId, participant);
        await load();
      } catch (err) {
        toast(errMessage(err), "error");
      } finally {
        setBusyIds((s) => {
          const next = new Set(s);
          next.delete(participant);
          return next;
        });
      }
    },
    [repoId, conversationId, load, toast],
  );

  // Bare username → `person:{username}` (the CLI builds the principal). Throws on
  // failure so the AddPeople form keeps the value for a retry.
  const addPerson = useCallback(
    async (raw: string) => {
      await addConversationParticipant(repoId, conversationId, raw.replace(/^@/, ""));
      await load();
    },
    [repoId, conversationId, load],
  );

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <LockedChip
        icon={<FolderGit2 size={13} strokeWidth={1.333} />}
        label={repoLabel}
        title="Context repo — set when the conversation started"
      />
      {agents.map((a) => (
        <LockedChip
          key={a.participant}
          icon={<Bot size={13} strokeWidth={1.333} />}
          label="Agent"
          title={`${a.participant} — set when the conversation started`}
        />
      ))}

      {!rosterError && participants && (
        <>
          <Divider />
          {people.map((p) => (
            <PersonChip
              key={p.participant}
              label={personLabel(p.participant, username)}
              removable={p.role !== "owner"}
              removing={busyIds.has(p.participant)}
              onRemove={() => void removePerson(p.participant)}
            />
          ))}
          <AddPeople onAdd={addPerson} />
        </>
      )}
    </div>
  );
}

function personLabel(participant: string, username: string): string {
  const bare = participant.replace(/^person:/, "");
  if (bare === username) return "you";
  // `node:{id}` (the owner) has no client-resolvable name yet.
  if (participant.startsWith("node:")) return "owner";
  return bare;
}

function LockedChip({ icon, label, title }: { icon: ReactNode; label: string; title: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 rounded-md border border-is-border bg-is-surface-alt px-2 py-1 font-chrome text-[11px] text-is-text-secondary"
    >
      <span className="shrink-0 text-is-text-tertiary">{icon}</span>
      <span className="max-w-[160px] truncate text-is-text">{label}</span>
      <Lock size={10} strokeWidth={1.5} className="shrink-0 text-is-text-tertiary" aria-hidden="true" />
    </span>
  );
}

function Divider() {
  return <span aria-hidden className="h-4 w-px shrink-0 bg-is-border" />;
}

function PersonChip({
  label,
  removable,
  removing,
  onRemove,
}: {
  label: string;
  removable: boolean;
  removing: boolean;
  onRemove: () => void;
}) {
  return (
    <span
      title={removable ? undefined : "Owner — can't be removed"}
      className="inline-flex items-center gap-1.5 rounded-md border border-is-border bg-is-surface py-1 pl-2 pr-1 font-chrome text-[11px] text-is-text"
    >
      <User size={13} strokeWidth={1.333} className="shrink-0 text-is-text-secondary" />
      <span className="max-w-[160px] truncate">{label}</span>
      {removable ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          aria-label={`Remove ${label}`}
          className="flex h-4 w-4 items-center justify-center rounded-full text-is-text-tertiary transition-colors hover:bg-is-border hover:text-is-text disabled:opacity-50"
        >
          <X size={11} strokeWidth={2} aria-hidden="true" />
        </button>
      ) : (
        <span className="w-1" />
      )}
    </span>
  );
}

function AddPeople({ onAdd }: { onAdd: (username: string) => Promise<void> }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-is-border px-2 py-1 font-chrome text-[11px] text-is-text-secondary transition-colors hover:border-is-text hover:text-is-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
      >
        <Plus size={13} strokeWidth={1.333} aria-hidden="true" />
        Add people
      </button>
    );
  }

  const cancel = () => {
    setOpen(false);
    setValue("");
  };
  const submit = async () => {
    const v = value.trim();
    if (!v || busy) return;
    setBusy(true);
    try {
      await onAdd(v);
      setValue("");
      setOpen(false);
    } catch (err) {
      toast(errMessage(err), "error"); // keep the form open + value for a retry
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") cancel();
      }}
      className="inline-flex items-center gap-1.5"
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="username"
        aria-label="Add a person by username"
        disabled={busy}
        className="w-32 rounded-md border border-is-border bg-is-bg px-2 py-1 font-chrome text-[11px] text-is-text outline-none focus-visible:border-is-accent disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={!value.trim() || busy}
        className="rounded-md bg-is-text px-2 py-1 font-chrome text-[11px] text-is-bg transition hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Adding…" : "Add"}
      </button>
      <button
        type="button"
        onClick={cancel}
        className="rounded-md px-1.5 py-1 font-chrome text-[11px] text-is-text-tertiary transition hover:text-is-text"
      >
        Cancel
      </button>
    </form>
  );
}
