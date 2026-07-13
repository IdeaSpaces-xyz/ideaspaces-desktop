import { useCallback, useEffect, useState } from "react";
import { piModels, type PiModel } from "../lib/cli";

/**
 * Loads the models a local Pi turn can use (`pi-models`), for the compose model
 * picker. The list is auth-gated, so an empty result on success means "no
 * provider configured yet" — the picker simply doesn't render. Kept separate
 * from usePiStatus: status gates whether Pi is usable at all; this fills the
 * picker once it is.
 */
export function usePiModels() {
  const [models, setModels] = useState<PiModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await piModels();
      setModels(list);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { models, loading, error, refetch: load };
}
