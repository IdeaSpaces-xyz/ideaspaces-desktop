import { useEffect, useRef, useState } from "react";
import { searchRepo, type SearchHit } from "../lib/cli";

// One searchable repo: an available-offline clone in the active context.
export interface SearchTarget {
  repoId: string;
  slug: string;
  clonePath: string;
}

// A hit with the repo it came from, so a flat ranked list can label each row
// and open it in the right clone.
export interface RankedHit extends SearchHit {
  repoId: string;
  slug: string;
  clonePath: string;
}

export interface RepoSearchState {
  hits: RankedHit[];
  loading: boolean;
  /** Repos that errored this run (e.g. a clone vanished) — shown as a footnote. */
  failed: number;
}

const DEBOUNCE_MS = 180;
const PER_REPO = 10;
const MAX_RESULTS = 40;

/**
 * Merge per-repo hit lists into one ranked list, highest score first, capped at
 * `max`. Ties break by path for a stable order. BM25 scores aren't normalised
 * across corpora, but the formula is shared so the ordering holds up for a
 * quick-jump palette. Pure — the testable core of the fan-out.
 */
export function mergeRankedHits(lists: RankedHit[][], max = MAX_RESULTS): RankedHit[] {
  const all = lists.flat();
  all.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return all.slice(0, max);
}

/**
 * Fan a local search across every target clone in parallel, merge by score, and
 * return one ranked list. Debounced; stale runs are dropped (a run counter, not
 * an AbortController — the sidecar calls are short and we just ignore late
 * results). BM25 scores aren't normalised across corpora, but the formula is
 * shared, so cross-repo ordering is good enough for a quick-jump palette.
 */
export function useRepoSearch(query: string, targets: SearchTarget[]): RepoSearchState {
  const [state, setState] = useState<RepoSearchState>({ hits: [], loading: false, failed: 0 });
  const runId = useRef(0);

  // Re-run when the (trimmed) query or the target set changes. Targets are
  // keyed by id so an unrelated re-render doesn't retrigger.
  const targetKey = targets.map((t) => t.repoId).join(",");

  useEffect(() => {
    const trimmed = query.trim();
    const id = ++runId.current;

    if (!trimmed || targets.length === 0) {
      setState({ hits: [], loading: false, failed: 0 });
      return;
    }

    setState((s) => ({ ...s, loading: true }));
    const timer = window.setTimeout(async () => {
      const settled = await Promise.allSettled(
        targets.map((t) =>
          searchRepo(t.clonePath, trimmed, PER_REPO).then((res) =>
            res.results.map(
              (hit): RankedHit => ({
                ...hit,
                repoId: t.repoId,
                slug: t.slug,
                clonePath: t.clonePath,
              }),
            ),
          ),
        ),
      );
      if (id !== runId.current) return; // a newer query superseded this one

      const lists: RankedHit[][] = [];
      let failed = 0;
      for (const r of settled) {
        if (r.status === "fulfilled") lists.push(r.value);
        else failed++;
      }
      setState({ hits: mergeRankedHits(lists), loading: false, failed });
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
    // targetKey stands in for targets (stable across unrelated renders).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, targetKey]);

  return state;
}
