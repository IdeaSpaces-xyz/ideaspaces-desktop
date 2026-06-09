import { Users } from "lucide-react";
import type { Space } from "../lib/cli";

export function SpacesList({ spaces }: { spaces: Space[] }) {
  if (spaces.length === 0) {
    return (
      <p className="text-sm text-is-text-secondary">
        No spaces yet — create one from your account to get started.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {spaces.map((space) => (
        <li
          key={space.repo_id}
          className="flex items-center justify-between rounded-lg border border-is-border bg-is-surface px-4 py-3"
        >
          <div className="min-w-0">
            <p className="truncate font-medium text-is-text">{space.slug}</p>
            <p className="text-xs text-is-text-tertiary">
              {space.hostname ?? "Personal"} · {space.role}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1 text-xs text-is-text-tertiary">
            <Users size={14} strokeWidth={1.333} aria-hidden="true" />
            {space.member_count}
          </span>
        </li>
      ))}
    </ul>
  );
}
