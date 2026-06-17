import type { ModelTier } from "./keeper-types";

// Shared labels for Keeper model tiers — the single source of truth for model
// pickers (the composer today; profile defaults / per-repo overrides later).
// Ported from is_web's conversation/model-tiers.ts.
export const MODEL_TIER_INFO: Record<ModelTier, { label: string; description: string }> = {
  haiku: { label: "Haiku", description: "Fast and efficient" },
  sonnet: { label: "Sonnet", description: "Balanced quality and speed" },
  opus: { label: "Opus", description: "Best depth and reasoning" },
};

// The tiers, in order.
export const MODEL_TIERS = Object.keys(MODEL_TIER_INFO) as ModelTier[];
