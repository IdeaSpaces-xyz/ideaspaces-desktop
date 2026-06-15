import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bot, MessageSquare, User } from "lucide-react";
import { useConversations, type ConversationRow } from "../spaces/useConversations";
import { bucketByTime, relativeTime } from "../lib/time";
import { listConversationParticipants, type Participant, type Space } from "../lib/cli";

// person:alice → "alice"; agent:n_x / node:n_y → the id. The prefix is shown
// via the row icon, so the label drops it.
function principalName(p: string): string {
  const i = p.indexOf(":");
  return i === -1 ? p : p.slice(i + 1);
}

function RoleTag({ role }: { role: Participant["role"] }) {
  return (
    <span className="shrink-0 rounded-full border border-is-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-is-text-tertiary">
      {role}
    </span>
  );
}

function ParticipantRow({ p, icon: Icon }: { p: Participant; icon: typeof User }) {
  return (
    <li className="flex items-center gap-2.5 rounded-lg border border-is-border bg-is-surface px-3 py-2.5">
      <Icon size={16} strokeWidth={1.333} className="shrink-0 text-is-text-tertiary" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-sm text-is-text">{principalName(p.participant)}</span>
      <RoleTag role={p.role} />
    </li>
  );
}

// An opened conversation's roster — its participants, split People / Agents.
// Read-only for now; add/remove is the next slice.
function ConversationDetail({
  conversation,
  onBack,
}: {
  conversation: ConversationRow;
  onBack: () => void;
}) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [parts, setParts] = useState<Participant[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    setError(undefined);
    listConversationParticipants(conversation.repoId, conversation.conversation_id)
      .then((p) => {
        if (alive) {
          setParts(p);
          setStatus("loaded");
        }
      })
      .catch((err) => {
        if (alive) {
          setError(err instanceof Error ? err.message : String(err));
          setStatus("error");
        }
      });
    return () => {
      alive = false;
    };
  }, [conversation.repoId, conversation.conversation_id, reloadCount]);

  // Agents speak as participants too (Tier 1); split them out so people read clean.
  const people = useMemo(() => parts.filter((p) => !p.participant.startsWith("agent:")), [parts]);
  const agents = useMemo(() => parts.filter((p) => p.participant.startsWith("agent:")), [parts]);

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1 text-xs text-is-text-tertiary transition hover:text-is-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
      >
        <ArrowLeft size={14} strokeWidth={1.333} aria-hidden="true" />
        Conversations
      </button>
      <h2 className="truncate text-lg font-medium text-is-text">{conversation.name || "Untitled"}</h2>
      <p className="mt-0.5 text-xs text-is-text-tertiary">
        {conversation.repoSlug} · {conversation.message_count} message
        {conversation.message_count === 1 ? "" : "s"}
      </p>

      {status === "loading" && (
        <p className="mt-6 text-sm text-is-text-tertiary">Loading participants…</p>
      )}
      {status === "error" && (
        <p className="mt-6 text-sm text-is-danger-text">
          {error}{" "}
          <button
            type="button"
            className="underline underline-offset-2 hover:text-is-text"
            onClick={() => setReloadCount((n) => n + 1)}
          >
            Retry
          </button>
        </p>
      )}
      {status === "loaded" && (
        <div className="mt-6 flex flex-col gap-6">
          <section>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-is-text-tertiary">
              People{people.length ? ` · ${people.length}` : ""}
            </p>
            {people.length ? (
              <ul className="flex flex-col gap-2">
                {people.map((p) => (
                  <ParticipantRow key={p.participant} p={p} icon={User} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-is-text-tertiary">No people in this conversation.</p>
            )}
          </section>
          {agents.length > 0 && (
            <section>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-is-text-tertiary">
                Agents · {agents.length}
              </p>
              <ul className="flex flex-col gap-2">
                {agents.map((p) => (
                  <ParticipantRow key={p.participant} p={p} icon={Bot} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// The connected Conversations surface — conversations across the active context's
// repos, newest first. Click one to open its roster (read-only).
export function ConversationsView({
  repos,
  reposLoading,
}: {
  repos: Space[];
  reposLoading: boolean;
}) {
  const { status, rows, error, truncated, reload } = useConversations(repos);
  const [selected, setSelected] = useState<ConversationRow | null>(null);
  // An open roster belongs to the context it was opened in — drop it on a
  // context/repo switch so we never show a conversation that's out of scope.
  useEffect(() => {
    setSelected(null);
  }, [repos]);
  // Repos still loading → repos is [] and conversations resolve to a false
  // "empty"; show loading until the repo set is known.
  const effectiveStatus = reposLoading ? "loading" : status;
  // Timeline split — Today / Yesterday / This week / … (is_web v2 parity). rows
  // arrive newest-first, which the bucketer preserves within each section.
  const buckets = useMemo(() => bucketByTime(rows, (c) => c.updated_at), [rows]);

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      {selected ? (
        <ConversationDetail conversation={selected} onBack={() => setSelected(null)} />
      ) : (
        <>
          <h2 className="mb-3 text-sm font-medium text-is-text-secondary">Conversations</h2>

          {effectiveStatus === "loading" && (
            <p className="text-sm text-is-text-tertiary">Loading conversations…</p>
          )}
          {effectiveStatus === "error" && (
            <p className="text-sm text-is-danger-text">
              {error}{" "}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-is-text"
                onClick={() => void reload()}
              >
                Retry
              </button>
            </p>
          )}
          {effectiveStatus === "loaded" && (
            <>
              {error && (
                <p className="mb-3 text-xs text-is-danger-text">
                  {error}{" "}
                  <button
                    className="underline underline-offset-2 hover:text-is-text"
                    onClick={() => void reload()}
                  >
                    Retry
                  </button>
                </p>
              )}
              {rows.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center">
                  <MessageSquare
                    size={28}
                    strokeWidth={1.333}
                    className="text-is-text-tertiary"
                    aria-hidden="true"
                  />
                  <p className="mt-3 max-w-sm text-sm text-is-text-tertiary">
                    No conversations in this context yet.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-8">
                  {buckets.map((bucket) => (
                    <section key={bucket.key}>
                      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-is-text-tertiary">
                        {bucket.label}
                      </p>
                      <ul className="flex flex-col gap-2">
                        {bucket.items.map((c) => (
                          <li key={c.conversation_id}>
                            <button
                              type="button"
                              onClick={() => setSelected(c)}
                              className="block w-full rounded-lg border border-is-border bg-is-surface px-4 py-3 text-left transition hover:border-is-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
                            >
                              <span className="flex items-baseline justify-between gap-3">
                                <span className="truncate font-medium text-is-text">{c.name || "Untitled"}</span>
                                <span className="shrink-0 text-xs text-is-text-tertiary">
                                  {relativeTime(c.updated_at)}
                                </span>
                              </span>
                              {c.summary && (
                                <span className="mt-0.5 block line-clamp-2 text-xs text-is-text-secondary">
                                  {c.summary}
                                </span>
                              )}
                              <span className="mt-1 block text-xs text-is-text-tertiary">
                                {c.repoSlug} · {c.message_count} message{c.message_count === 1 ? "" : "s"}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
              {rows.length > 0 && truncated && (
                <p className="mt-3 text-center text-xs text-is-text-tertiary">
                  Showing recent conversations.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
