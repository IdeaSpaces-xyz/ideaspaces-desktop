import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useRepoSearch, type RankedHit, type SearchTarget } from "./useRepoSearch";

// A ⌘K quick-jump over the active context's offline repos. Local, instant: it
// drives the CLI `search` verb per clone, merges by score, and opens the picked
// note in its repo. Online-only (uncloned) repos aren't searchable — a footnote
// says so rather than silently omitting them.
export function SearchPalette({
  targets,
  onlineOnlyCount,
  onOpen,
  onClose,
}: {
  targets: SearchTarget[];
  onlineOnlyCount: number;
  onOpen: (hit: RankedHit) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const { hits, loading, failed } = useRepoSearch(query, targets);
  const listRef = useRef<HTMLUListElement>(null);

  // Keep the highlight in range as results change, and never leave it stranded
  // past the end when the list shrinks.
  useEffect(() => {
    setActive((i) => (hits.length === 0 ? 0 : Math.min(i, hits.length - 1)));
  }, [hits]);

  // Scroll the active row into view as the user arrows through.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({
      block: "nearest",
    });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(0, hits.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[active];
      if (hit) onOpen(hit);
    }
  };

  const trimmed = query.trim();
  const showEmpty = trimmed.length > 0 && !loading && hits.length === 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search notes"
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-is-border bg-is-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex shrink-0 items-center gap-2.5 border-b border-is-border px-4 py-3">
          <Search size={16} className="shrink-0 text-is-text-tertiary" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              targets.length > 0
                ? `Search ${targets.length} repo${targets.length === 1 ? "" : "s"}…`
                : "No repos available offline to search"
            }
            disabled={targets.length === 0}
            className="min-w-0 flex-1 bg-transparent font-chrome text-[14px] text-is-text outline-none placeholder:text-is-text-tertiary"
          />
          {loading && <span className="shrink-0 text-[11px] text-is-text-tertiary">searching…</span>}
        </div>

        {hits.length > 0 && (
          <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-1">
            {hits.map((hit, i) => (
              <li key={`${hit.repoId}:${hit.path}`}>
                <button
                  data-idx={i}
                  onClick={() => onOpen(hit)}
                  onMouseMove={() => setActive(i)}
                  className={`flex w-full flex-col gap-0.5 px-4 py-2 text-left ${
                    i === active ? "bg-is-surface-alt" : ""
                  }`}
                >
                  <span className="flex items-baseline gap-2 font-chrome text-[12.5px]">
                    <span className="shrink-0 text-is-text-tertiary">{hit.slug}</span>
                    <span className="truncate text-is-text">
                      {hit.path}
                      {hit.line != null && (
                        <span className="text-is-text-tertiary">:{hit.line}</span>
                      )}
                    </span>
                  </span>
                  {hit.snippet && (
                    <span className="truncate text-[12px] text-is-text-secondary">
                      {hit.snippet}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {showEmpty && (
          <div className="px-4 py-6 text-center text-[13px] text-is-text-secondary">
            No matches for &ldquo;{trimmed}&rdquo;.
          </div>
        )}

        {(onlineOnlyCount > 0 || failed > 0) && (
          <div className="shrink-0 border-t border-is-border px-4 py-2 text-[11px] text-is-text-tertiary">
            {onlineOnlyCount > 0 && (
              <span>
                {onlineOnlyCount} repo{onlineOnlyCount === 1 ? "" : "s"} online-only — make
                available offline to search{failed > 0 ? " · " : ""}
              </span>
            )}
            {failed > 0 && <span>{failed} could not be searched</span>}
          </div>
        )}
      </div>
    </div>
  );
}
