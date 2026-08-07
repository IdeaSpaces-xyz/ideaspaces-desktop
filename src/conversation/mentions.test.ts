import { describe, expect, it } from "vitest";
import { getMentionState, insertMention, extractMentions } from "./mentions";
import type { MentionEntry } from "../lib/cli";

const entry = (path: string): MentionEntry => ({ path, name: path.split("/").pop() ?? path, kind: "file" });

describe("getMentionState", () => {
  it("detects a mention at the start of input", () => {
    expect(getMentionState("@aw", 3)).toEqual({ start: 0, query: "aw" });
  });

  it("detects a mention after whitespace and captures a nested path query", () => {
    const v = "look at @notes/aw";
    expect(getMentionState(v, v.length)).toEqual({ start: 8, query: "notes/aw" });
  });

  it("returns null when there is no @ before the cursor", () => {
    expect(getMentionState("hello world", 11)).toBeNull();
  });

  it("returns null when the @ is mid-word (email-like), not a trigger", () => {
    expect(getMentionState("mail me at a@b", 14)).toBeNull();
  });

  it("closes once whitespace follows the token (cursor past it)", () => {
    const v = "@notes done";
    expect(getMentionState(v, v.length)).toBeNull();
  });
});

describe("insertMention", () => {
  it("replaces the in-progress @query with a full @path pointer and a trailing space", () => {
    const v = "see @aw";
    const state = getMentionState(v, v.length)!;
    const r = insertMention(v, state, entry("notes/awareness.md"));
    expect(r.value).toBe("see @notes/awareness.md ");
    expect(r.value.slice(r.cursor)).toBe(""); // caret lands at the end, after the space
  });

  it("does not add a second space when one already follows", () => {
    const v = "@aw here";
    const state = getMentionState(v, 3)!;
    const r = insertMention(v, state, entry("notes/awareness.md"));
    expect(r.value).toBe("@notes/awareness.md here");
    expect(r.value.slice(r.cursor)).toBe(" here"); // caret before the existing space
  });
});

describe("extractMentions", () => {
  it("pulls every @path token from a message", () => {
    expect(extractMentions("look at @notes/a.md and @b.md")).toEqual(["notes/a.md", "b.md"]);
  });
  it("dedupes repeats", () => {
    expect(extractMentions("@a.md @a.md")).toEqual(["a.md"]);
  });
  it("ignores an @ mid-word (e.g. an email)", () => {
    expect(extractMentions("mail me at me@example.com")).toEqual([]);
  });
  it("trims trailing sentence punctuation from a path", () => {
    expect(extractMentions("see @notes/a.md.")).toEqual(["notes/a.md"]);
  });
  it("returns nothing when there are no mentions", () => {
    expect(extractMentions("plain message")).toEqual([]);
  });
});
