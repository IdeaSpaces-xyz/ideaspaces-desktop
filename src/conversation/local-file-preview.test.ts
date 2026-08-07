import { describe, it, expect } from "vitest";
import { resolveUnder, isEditableFile } from "./local-file-preview";

describe("resolveUnder", () => {
  it("keeps an absolute path unchanged", () => {
    expect(resolveUnder("/home/space", "/other/file.md")).toBe("/other/file.md");
  });
  it("joins a relative path under base", () => {
    expect(resolveUnder("/home/space", "notes/a.md")).toBe("/home/space/notes/a.md");
  });
  it("strips a leading ./ and a trailing slash on base", () => {
    expect(resolveUnder("/home/space/", "./a.md")).toBe("/home/space/a.md");
  });
});

describe("isEditableFile", () => {
  const home = "/home/space";
  it("is editable when directly under home", () => {
    expect(isEditableFile("/home/space/notes/a.md", home, [])).toBe(true);
  });
  it("is NOT editable when outside home", () => {
    expect(isEditableFile("/other/a.md", home, [])).toBe(false);
  });
  it("is NOT editable when inside a mounted (read-only) reference", () => {
    expect(isEditableFile("/home/space/paul-graham/essays/x.md", home, ["/home/space/paul-graham"])).toBe(
      false,
    );
  });
  it("stays editable for a home file that isn't under any mount", () => {
    expect(isEditableFile("/home/space/a.md", home, ["/home/space/paul-graham"])).toBe(true);
  });
});
