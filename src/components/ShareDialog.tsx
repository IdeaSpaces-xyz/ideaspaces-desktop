import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Link2, Loader2, Trash2, X } from "lucide-react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  shareAccess,
  shareSetAccess,
  shareMembers,
  shareRemoveMember,
  shareInvites,
  shareInvite,
  shareRevoke,
  type Member,
  type PendingInvite,
  type SpaceAccess,
  type InviteRole,
  type CopyAccessLevel,
} from "../lib/cli";
import { SITE_ORIGIN } from "../lib/web";
import { useToast } from "../toast/toast-context";
import { cn } from "../lib/cn";

const INVITE_ROLES: { value: InviteRole; label: string }[] = [
  { value: "MEMBER", label: "Member — read, clone, push" },
  { value: "CLONER", label: "Cloner — read, clone" },
  { value: "READER", label: "Reader — read only" },
];
const COPY_LEVELS: { value: CopyAccessLevel; label: string }[] = [
  { value: "owner", label: "Only the owner" },
  { value: "member", label: "Owners & members" },
  { value: "reader", label: "Anyone with access" },
  { value: "public", label: "Anyone signed in with the link" },
];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const labelCls = "font-chrome text-[11px] uppercase tracking-[0.08em] text-is-text-tertiary";
const inputCls =
  "w-full rounded-md border border-is-border bg-is-bg px-2.5 py-1.5 text-sm text-is-text outline-none focus-visible:border-is-accent placeholder:text-is-text-tertiary disabled:opacity-50";

// The repo's access surface (is_web ShareDialog parity): invite people, manage
// who has access, and the public-link policy — all owner-gated (the verbs 403
// otherwise, surfaced as "owner only"). Driven by the CLI `share` verbs.
export function ShareDialog({
  repoId,
  repoLabel,
  onClose,
}: {
  repoId: string;
  repoLabel: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const cardRef = useRef<HTMLDivElement>(null);

  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<PendingInvite[] | null>(null);
  const [access, setAccess] = useState<SpaceAccess | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("MEMBER");
  const [inviting, setInviting] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [savingAccess, setSavingAccess] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const reload = useCallback(async () => {
    setLoadError(null);
    try {
      const [m, i, a] = await Promise.all([
        shareMembers(repoId),
        shareInvites(repoId),
        shareAccess(repoId),
      ]);
      setMembers(m);
      setInvites(i);
      setAccess(a);
    } catch (err) {
      setLoadError(errMsg(err));
    }
  }, [repoId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Escape to close + focus trap (matches the other desktop modals).
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const focusables = () =>
      Array.from(
        card.querySelectorAll<HTMLElement>(
          'button, a[href], input, select, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled"));
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (e.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    card.addEventListener("keydown", onKey);
    return () => card.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isEmail = EMAIL_RE.test(email.trim());

  const submitInvite = async () => {
    if (!isEmail || inviting) return;
    setInviting(true);
    try {
      const [r] = await shareInvite(repoId, [email.trim()], role);
      toast(r?.status === "sent" ? `Invited ${r.email}` : `${r?.email}: ${r?.status ?? "done"}`);
      setEmail("");
      await reload();
    } catch (err) {
      toast(errMsg(err), "error");
    } finally {
      setInviting(false);
    }
  };

  const removeMember = async (m: Member) => {
    setBusyKey(`m${m.user_id}`);
    try {
      await shareRemoveMember(repoId, m.user_id);
      await reload();
    } catch (err) {
      toast(errMsg(err), "error");
    } finally {
      setBusyKey(null);
    }
  };

  const revoke = async (inv: PendingInvite) => {
    setBusyKey(`i${inv.invite_id}`);
    try {
      await shareRevoke(repoId, inv.invite_id);
      await reload();
    } catch (err) {
      toast(errMsg(err), "error");
    } finally {
      setBusyKey(null);
    }
  };

  const saveAccess = async (readPublic: boolean, copy: CopyAccessLevel) => {
    setSavingAccess(true);
    try {
      setAccess(await shareSetAccess(repoId, readPublic, copy));
    } catch (err) {
      toast(errMsg(err), "error");
    } finally {
      setSavingAccess(false);
    }
  };

  const shareLink = access?.read_public ? `${SITE_ORIGIN}/spaces/${access.root_node_id}` : null;
  const copyLink = async () => {
    if (!shareLink) return;
    try {
      await writeText(shareLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1200);
    } catch (err) {
      toast(errMsg(err), "error");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-is-overlay p-4 pt-[8vh]"
      onClick={onClose}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Share ${repoLabel}`}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-is-border bg-is-surface shadow-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-is-border px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-medium text-is-text">Share {repoLabel}</h2>
            <p className="mt-0.5 text-xs text-is-text-tertiary">
              People you add can read and work in this repo, per their role.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-md p-1.5 text-is-text-tertiary transition hover:bg-is-surface-alt hover:text-is-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
          >
            <X size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
          {loadError && <p className="text-sm text-is-danger-text">{loadError}</p>}

          {/* Invite people */}
          <section className="space-y-2">
            <p className={labelCls}>Invite people</p>
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void submitInvite();
                  }
                }}
                placeholder="email@example.com"
                aria-label="Invite by email"
                disabled={inviting}
                className={inputCls}
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as InviteRole)}
                aria-label="Role"
                disabled={inviting}
                className="shrink-0 rounded-md border border-is-border bg-is-bg px-2 py-1.5 font-chrome text-xs text-is-text-secondary outline-none focus-visible:border-is-accent"
              >
                {INVITE_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.value[0] + r.value.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void submitInvite()}
                disabled={!isEmail || inviting}
                className="shrink-0 rounded-md bg-is-text px-3 py-1.5 font-chrome text-xs text-is-bg transition hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
              >
                {inviting ? "Inviting…" : "Invite"}
              </button>
            </div>
          </section>

          {/* People with access */}
          <section className="space-y-2">
            <p className={labelCls}>People with access</p>
            {members === null ? (
              <p className="text-sm text-is-text-tertiary">Loading…</p>
            ) : members.length === 0 ? (
              <p className="text-sm text-is-text-tertiary">Just you.</p>
            ) : (
              <ul className="divide-y divide-is-border rounded-lg border border-is-border">
                {members.map((m) => (
                  <li key={m.user_id} className="flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-is-text">
                      {m.username ?? m.email ?? `user ${m.user_id}`}
                    </span>
                    <span className="shrink-0 font-chrome text-[11px] uppercase tracking-[0.04em] text-is-text-tertiary">
                      {m.role.toLowerCase()}
                    </span>
                    {m.role !== "OWNER" && (
                      <button
                        type="button"
                        onClick={() => void removeMember(m)}
                        disabled={busyKey === `m${m.user_id}`}
                        aria-label={`Remove ${m.username ?? m.email ?? m.user_id}`}
                        title="Remove"
                        className="shrink-0 rounded p-1 text-is-text-tertiary transition hover:bg-is-surface-alt hover:text-is-danger-text disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
                      >
                        {busyKey === `m${m.user_id}` ? (
                          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                        ) : (
                          <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
                        )}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Pending invites */}
          {invites && invites.length > 0 && (
            <section className="space-y-2">
              <p className={labelCls}>Pending invites</p>
              <ul className="divide-y divide-is-border rounded-lg border border-is-border">
                {invites.map((inv) => (
                  <li key={inv.invite_id} className="flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-is-text-secondary">
                      {inv.invited_email}
                    </span>
                    <span className="shrink-0 font-chrome text-[11px] uppercase tracking-[0.04em] text-is-text-tertiary">
                      {inv.role.toLowerCase()}
                    </span>
                    <button
                      type="button"
                      onClick={() => void revoke(inv)}
                      disabled={busyKey === `i${inv.invite_id}`}
                      aria-label={`Revoke invite for ${inv.invited_email}`}
                      title="Revoke"
                      className="shrink-0 rounded p-1 text-is-text-tertiary transition hover:bg-is-surface-alt hover:text-is-danger-text disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring"
                    >
                      {busyKey === `i${inv.invite_id}` ? (
                        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <X size={14} strokeWidth={1.5} aria-hidden="true" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* General access (public link) */}
          {access && (
            <section className="space-y-2">
              <p className={labelCls}>General access</p>
              <label className="flex items-center gap-2 text-sm text-is-text">
                <input
                  type="checkbox"
                  checked={access.read_public}
                  disabled={savingAccess}
                  onChange={(e) => void saveAccess(e.target.checked, access.copy_access)}
                  className="h-4 w-4 accent-is-accent"
                />
                Anyone with the link can read
              </label>
              {access.read_public && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-is-text-tertiary">Who can copy:</span>
                    <select
                      value={access.copy_access}
                      disabled={savingAccess}
                      onChange={(e) => void saveAccess(true, e.target.value as CopyAccessLevel)}
                      aria-label="Copy access"
                      className="rounded-md border border-is-border bg-is-bg px-2 py-1 font-chrome text-xs text-is-text-secondary outline-none focus-visible:border-is-accent"
                    >
                      {COPY_LEVELS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {shareLink && (
                    <button
                      type="button"
                      onClick={() => void copyLink()}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md border border-is-border bg-is-bg px-2.5 py-1.5 text-left text-xs transition hover:border-is-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-is-focus-ring",
                      )}
                    >
                      {linkCopied ? (
                        <Check size={13} strokeWidth={1.75} className="shrink-0 text-is-accent-text" aria-hidden="true" />
                      ) : (
                        <Link2 size={13} strokeWidth={1.5} className="shrink-0 text-is-text-tertiary" aria-hidden="true" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-is-text-secondary">{shareLink}</span>
                      <span className="shrink-0 text-is-text-tertiary">{linkCopied ? "Copied" : "Copy"}</span>
                    </button>
                  )}
                </>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
