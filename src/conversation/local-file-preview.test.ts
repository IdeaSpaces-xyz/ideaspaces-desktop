import { describe, it, expect } from "vitest";
import { resolveUnder, normalizePath, isWithinContext } from "./local-file-preview";

describe("normalizePath", () => {
  it("collapses . and .. segments in an absolute path", () => {
    expect(normalizePath("/home/space/notes/../a.md")).toBe("/home/space/a.md");
  });
  it("drops .. above root for an absolute path", () => {
    expect(normalizePath("/home/space/../../../.ideaspaces/creds")).toBe("/.ideaspaces/creds");
  });
});

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
  it("resolves .. so a traversal token escapes the base string prefix", () => {
    // The attack: this must NOT stay under /home/space.
    expect(resolveUnder("/home/space", "../../.ideaspaces/credentials.json")).toBe(
      "/.ideaspaces/credentials.json",
    );
  });
});

describe("isWithinContext (confinement gate)", () => {
  const home = "/home/space";
  it("allows a normal file under home", () => {
    expect(isWithinContext("/home/space/notes/a.md", home, [])).toBe(true);
  });
  it("rejects a traversal that escaped home", () => {
    const escaped = resolveUnder(home, "../../.ideaspaces/credentials.json");
    expect(isWithinContext(escaped, home, [])).toBe(false);
  });
  it("allows a file inside a mounted reference outside home", () => {
    expect(isWithinContext("/mnt/ref/a.md", home, ["/mnt/ref"])).toBe(true);
  });
  it("allows a file inside a mount under home (now user-editable)", () => {
    expect(
      isWithinContext("/home/space/paul-graham/essays/x.md", home, ["/home/space/paul-graham"]),
    ).toBe(true);
  });
});
