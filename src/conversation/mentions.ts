// @-mention parsing for the local Pi composer. Pointer semantics: a mention
// inserts a readable `@relative/path` token straight into the message text — the
// path *is* the payload, and the agent (whose cwd is the workspace) reads it on
// demand. There is no hidden context array to track, unlike Keeper's node-id
// mentions in is_web. Pure functions so the composer stays thin and testable.

import type { MentionEntry } from "../lib/cli";

export interface MentionState {
  /** Index of the triggering `@` in the value. */
  start: number;
  /** The mention text typed so far (between `@` and the cursor). */
  query: string;
}

// An in-progress mention: `@` at the start of input or after whitespace, then
// the token so far. The charset covers a path being typed (word chars, `/ . -`)
// so a nested path like `@notes/aw` keeps the menu open.
const MENTION_RE = /(^|\s)@([\w./-]*)$/;

// Every completed `@path` pointer in a message — the same charset as the live
// menu, matched globally. Used to recover the files a turn brought into context
// from the message text (the pointer *is* the payload; there's no context array
// locally). A trailing `/`, `.`, or `-` is trimmed so sentence punctuation after
// a mention doesn't ride along into the path.
//
// SAFETY: the charset mirrors the picker for UX, NOT for safety — it permits `.`
// and `/`, so `@../../x` is representable. Confinement is enforced downstream by
// `isWithinContext` (local-file-preview.ts), which normalizes and rejects any
// path outside home/mounts. Never treat a token from here as pre-validated.
const MENTION_GLOBAL_RE = /(?:^|\s)@([\w./-]+)/g;

/** Extract the relative-path tokens from every `@mention` in a message. */
export function extractMentions(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(MENTION_GLOBAL_RE)) {
    const path = m[1].replace(/[./-]+$/, "");
    if (path) out.push(path);
  }
  return [...new Set(out)];
}

export function getMentionState(value: string, cursor: number | null): MentionState | null {
  if (cursor == null) return null;
  const before = value.slice(0, cursor);
  const match = before.match(MENTION_RE);
  if (!match) return null;
  const query = match[2] ?? "";
  const start = cursor - query.length - 1; // step back over the query and the `@`
  if (start < 0) return null;
  return { start, query };
}

export interface InsertResult {
  value: string;
  cursor: number;
}

// Replace the in-progress `@query` with a full `@path` pointer. A trailing space
// is added unless the next character is already whitespace, so the caret lands
// ready for the next word.
export function insertMention(value: string, state: MentionState, entry: MentionEntry): InsertResult {
  const before = value.slice(0, state.start);
  const after = value.slice(state.start + state.query.length + 1);
  const spacer = /^\s/.test(after) ? "" : " ";
  const token = `@${entry.path}`;
  return {
    value: `${before}${token}${spacer}${after}`,
    cursor: before.length + token.length + spacer.length,
  };
}
