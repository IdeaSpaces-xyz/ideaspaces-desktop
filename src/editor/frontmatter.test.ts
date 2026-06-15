import { describe, expect, it } from "vitest";
import { parseFrontmatter, setFrontmatterName } from "./frontmatter";

describe("parseFrontmatter", () => {
  it("parses a basic block with 1-based fence lines", () => {
    const fm = parseFrontmatter("---\nname: Hello\nsummary: A note\n---\nbody\n");
    expect(fm).not.toBeNull();
    expect(fm!.startLine).toBe(1);
    expect(fm!.endLine).toBe(4);
    expect(fm!.fields).toEqual([
      { key: "name", value: "Hello" },
      { key: "summary", value: "A note" },
    ]);
  });

  it("keeps colons in the value (only the first colon splits key/value)", () => {
    expect(parseFrontmatter("---\nname: a: b: c\n---\n")!.fields[0]).toEqual({
      key: "name",
      value: "a: b: c",
    });
  });

  it("strips matching outer quotes", () => {
    expect(parseFrontmatter("---\nname: 'Quoted'\n---\n")!.fields[0].value).toBe("Quoted");
  });

  it("collapses a block scalar's continuation lines onto one", () => {
    expect(parseFrontmatter("---\nsummary: |\n  line one\n  line two\n---\n")!.fields[0]).toEqual({
      key: "summary",
      value: "line one line two",
    });
  });

  it("is CRLF-safe", () => {
    const fm = parseFrontmatter("---\r\nname: Hi\r\n---\r\nbody");
    expect(fm!.fields[0].value).toBe("Hi");
    expect(fm!.endLine).toBe(3);
  });

  it("ignores comments and blank lines", () => {
    expect(parseFrontmatter("---\n# a comment\n\nname: Hi\n---\n")!.fields).toEqual([
      { key: "name", value: "Hi" },
    ]);
  });

  it("returns null without an opening fence", () => {
    expect(parseFrontmatter("name: Hi\n---\n")).toBeNull();
    expect(parseFrontmatter("# Heading\n")).toBeNull();
  });

  it("returns null for an unterminated block (never hijacks the doc)", () => {
    expect(parseFrontmatter("---\nname: Hi\nno closing fence here\n")).toBeNull();
  });
});

describe("setFrontmatterName", () => {
  it("replaces an existing name, preserving other fields and the body", () => {
    expect(setFrontmatterName("---\nname: Old\nsummary: keep\n---\nbody\n", "New")).toBe(
      "---\nname: New\nsummary: keep\n---\nbody\n",
    );
  });

  it("inserts a name when the block has none", () => {
    const out = setFrontmatterName("---\nsummary: keep\n---\nbody\n", "New");
    expect(parseFrontmatter(out)!.fields).toContainEqual({ key: "name", value: "New" });
    expect(out).toContain("summary: keep");
  });

  it("creates a frontmatter block when there is none", () => {
    const out = setFrontmatterName("just body\n", "Title");
    expect(out.startsWith("---\nname: Title\n---\n")).toBe(true);
    expect(out).toContain("just body");
  });

  it("quotes values that need it and round-trips them", () => {
    // YAML 1.1 reserved word, flow indicator, embedded colon.
    expect(setFrontmatterName("", "yes")).toContain("name: 'yes'");
    expect(setFrontmatterName("", "[draft]")).toContain("name: '[draft]'");
    expect(setFrontmatterName("", "a: b")).toContain("name: 'a: b'");
    expect(parseFrontmatter(setFrontmatterName("", "yes"))!.fields[0].value).toBe("yes");
    expect(parseFrontmatter(setFrontmatterName("", "a: b"))!.fields[0].value).toBe("a: b");
  });

  it("leaves plain values unquoted", () => {
    expect(setFrontmatterName("", "Hello World")).toContain("name: Hello World");
  });
});
