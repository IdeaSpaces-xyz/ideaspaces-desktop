import { useCallback, useEffect, useRef, useState } from "react";
import { getNode, type NodeDetail } from "../lib/cli";

export type NodeState =
  | { status: "loading" }
  | { status: "loaded"; node: NodeDetail }
  | { status: "error"; error: string };

// Resolves conversation-workspace node-ids to their detail (name + content),
// cached per id. The workspace strip resolves names; the preview pane reads the
// same cache for content — one fetch per node (no batch endpoint yet). Resets
// when the repo changes — nodes are repo-scoped, so same-repo conversation
// switches intentionally share the cache.
export function useNodeCache(repoId: string) {
  const [cache, setCache] = useState<Map<string, NodeState>>(new Map());
  const requested = useRef<Set<string>>(new Set());

  useEffect(() => {
    setCache(new Map());
    requested.current = new Set();
  }, [repoId]);

  const resolve = useCallback(
    (nodeId: string) => {
      if (requested.current.has(nodeId)) return; // already fetched / in flight
      requested.current.add(nodeId);
      setCache((c) => new Map(c).set(nodeId, { status: "loading" }));
      getNode(repoId, nodeId)
        .then((node) => setCache((c) => new Map(c).set(nodeId, { status: "loaded", node })))
        .catch((err) =>
          setCache((c) =>
            new Map(c).set(nodeId, {
              status: "error",
              error: err instanceof Error ? err.message : String(err),
            }),
          ),
        );
    },
    [repoId],
  );

  return { cache, resolve };
}
