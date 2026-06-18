import { describe, expect, it } from "vitest";
import { noteToMarkdown } from "./exportNote";

describe("noteToMarkdown", () => {
  it("strips frontmatter and prepends the title as H1", () => {
    expect(noteToMarkdown("---\nname: Hello\n---\nBody text\n", "Hello")).toBe(
      "# Hello\n\nBody text\n",
    );
  });

  it("keeps the body as-is when it already opens with a heading", () => {
    expect(noteToMarkdown("---\nname: Hi\n---\n# Hi\n\nText\n", "Hi")).toBe("# Hi\n\nText\n");
  });

  it("prepends the title when there is no frontmatter", () => {
    expect(noteToMarkdown("Just text\n", "Title")).toBe("# Title\n\nJust text\n");
  });

  it("does not prepend an empty title", () => {
    expect(noteToMarkdown("---\nname: x\n---\nBody\n", "")).toBe("Body\n");
  });
});
