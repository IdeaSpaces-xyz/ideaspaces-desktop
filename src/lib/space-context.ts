// Space contexts — the Personal / org boundary the header switches on.
// Ported from is_web's lib/space-context: the user is the Personal context,
// and every distinct company hostname across their spaces is an org context.

import type { Space } from "./cli";

export interface SpaceContext {
  kind: "personal" | "org";
  /** Stable ref used as the switcher value. */
  ref: string;
  /** Display label — username for Personal, hostname for org. */
  label: string;
  /** Company hostname for org contexts; null for Personal. */
  hostname: string | null;
}

/** Personal context first, then one per distinct company hostname (sorted). */
export function deriveSpaceContexts(
  username: string | null | undefined,
  spaces: Space[],
): SpaceContext[] {
  if (!username) return [];

  const personal: SpaceContext = {
    kind: "personal",
    ref: `person:${username}`,
    label: username,
    hostname: null,
  };

  const hostnames = [
    ...new Set(spaces.map((s) => s.hostname).filter((h): h is string => !!h)),
  ].sort((a, b) => a.localeCompare(b));

  const orgs: SpaceContext[] = hostnames.map((hostname) => ({
    kind: "org",
    ref: `hostname:${hostname}`,
    label: hostname,
    hostname,
  }));

  return [personal, ...orgs];
}

/** Resolve the active context from a ref, defaulting to Personal (first). */
export function resolveContext(
  contexts: SpaceContext[],
  ref: string | undefined,
): SpaceContext | null {
  if (contexts.length === 0) return null;
  if (ref) {
    const match = contexts.find((c) => c.ref === ref);
    if (match) return match;
  }
  return contexts[0];
}

/** Spaces visible within a context (personal spaces vs a hostname's spaces). */
export function spacesForContext(spaces: Space[], context: SpaceContext): Space[] {
  return spaces.filter((s) => (s.hostname ?? null) === context.hostname);
}
