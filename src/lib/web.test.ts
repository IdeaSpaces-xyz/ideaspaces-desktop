import { describe, it, expect } from "vitest";
import { spaceUrl, SITE_ORIGIN } from "./web";

describe("spaceUrl", () => {
  it("builds the public /owner/repo/space path", () => {
    expect(spaceUrl("ernests", "notes", "ideas/a-note.md")).toBe(
      `${SITE_ORIGIN}/ernests/notes/space/ideas/a-note`,
    );
  });

  it("drops the markdown extension (node paths are extensionless)", () => {
    expect(spaceUrl("o", "r", "x.markdown")).toBe(`${SITE_ORIGIN}/o/r/space/x`);
  });

  it("returns the repo root when the path is empty", () => {
    expect(spaceUrl("o", "r")).toBe(`${SITE_ORIGIN}/o/r/space`);
  });

  it("encodes each segment but keeps separators", () => {
    expect(spaceUrl("o", "r", "a b/c.md")).toBe(`${SITE_ORIGIN}/o/r/space/a%20b/c`);
  });
});
