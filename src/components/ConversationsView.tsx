import { MessageSquare } from "lucide-react";

// Placeholder. Keeper conversations are the connected/browse surface (P2) —
// the rail destination is here; the surface fills in incrementally.
export function ConversationsView() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-6 py-20 text-center">
      <MessageSquare size={28} strokeWidth={1.333} className="text-is-text-tertiary" aria-hidden="true" />
      <h2 className="mt-3 text-sm font-medium text-is-text-secondary">Conversations</h2>
      <p className="mt-1 max-w-sm text-sm text-is-text-tertiary">
        Keeper conversations over your spaces will live here.
      </p>
    </div>
  );
}
