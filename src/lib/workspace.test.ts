import { describe, expect, it } from "vitest";
import { accountRef } from "./workspace";

describe("accountRef", () => {
  it("keys personal by username", () => {
    expect(accountRef(null, "bob")).toBe("person:bob");
  });
  it("keys an org by hostname (username ignored)", () => {
    expect(accountRef("acme.com", "bob")).toBe("hostname:acme.com");
  });
  it("tolerates a null username for personal", () => {
    expect(accountRef(null, null)).toBe("person:");
  });
});
