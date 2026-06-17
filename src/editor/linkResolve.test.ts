import { describe, expect, it } from "vitest";
import { webUrl } from "./linkResolve";

describe("webUrl", () => {
  it("passes through an explicit http(s) URL", () => {
    expect(webUrl("https://example.com")).toBe("https://example.com");
    expect(webUrl("http://example.com/path?q=1")).toBe("http://example.com/path?q=1");
  });

  it("qualifies a bare host (the `[[example.com]]` case)", () => {
    expect(webUrl("example.com")).toBe("https://example.com");
    expect(webUrl("sub.example.co.uk/path")).toBe("https://sub.example.co.uk/path");
  });

  it("is null for a note name (no dot) — stays an internal link", () => {
    expect(webUrl("meeting-notes")).toBeNull();
    expect(webUrl("Some Note")).toBeNull();
  });

  it("is null for note files and relative paths — never hijacks a note link", () => {
    expect(webUrl("note.md")).toBeNull();
    expect(webUrl("../core/space.md")).toBeNull();
    expect(webUrl("folder/note.markdown")).toBeNull();
  });

  it("is null for other schemes (mailto:) — not http(s)", () => {
    expect(webUrl("mailto:a@b.com")).toBeNull();
  });
});
