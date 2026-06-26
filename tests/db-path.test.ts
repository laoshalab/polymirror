import { describe, it, expect } from "vitest";
import { resolveDbPath, resolveAccountDbPath } from "../src/state/db-path.js";

describe("resolveDbPath", () => {
  it("uses preview db in preview mode", () => {
    expect(resolveDbPath(true)).toBe("data/preview.db");
  });

  it("uses live db when not preview", () => {
    expect(resolveDbPath(false)).toBe("data/polymirror.db");
  });
});

describe("resolveAccountDbPath", () => {
  it("uses per-account path for non-default accounts", () => {
    expect(resolveAccountDbPath("sub1", true)).toBe("data/accounts/sub1/preview.db");
  });

  it("uses legacy preview path for default when it exists", () => {
    expect(resolveAccountDbPath("default", true)).toBe("data/preview.db");
  });
});
