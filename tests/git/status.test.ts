// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { describe, it, expect } from "vitest";
import { parseGitStatus, parseGitIgnored } from "../../src/git/log";

describe("parseGitStatus", () => {
  it("maps each porcelain XY pair to one code, preferring the worktree column", () => {
    const stdout = [
      " M src/edited.ts", // unstaged modification (Y = M)
      "M  src/staged.ts", // staged modification (X = M)
      "A  src/added.ts", // staged new file
      " D src/gone.ts", // deleted in the worktree
      "?? src/new.ts", // untracked
    ].join("\n");

    expect(parseGitStatus(stdout)).toEqual([
      { path: "src/edited.ts", code: "M" },
      { path: "src/staged.ts", code: "M" },
      { path: "src/added.ts", code: "A" },
      { path: "src/gone.ts", code: "D" },
      { path: "src/new.ts", code: "U" },
    ]);
  });

  it("reports the new path for a rename and ignores blank lines", () => {
    const stdout = ["R  old/name.ts -> new/name.ts", "", "   "].join("\n");
    expect(parseGitStatus(stdout)).toEqual([{ path: "new/name.ts", code: "R" }]);
  });

  it("returns nothing for a clean tree", () => {
    expect(parseGitStatus("")).toEqual([]);
  });
});

describe("parseGitIgnored", () => {
  it("collects the !! entries and strips a trailing slash from ignored directories", () => {
    const stdout = [
      " M src/edited.ts", // a normal change, not ignored
      "?? src/new.ts",
      "!! .env",
      "!! .mcp.json",
      "!! node_modules/", // ignored directory
    ].join("\n");
    expect(parseGitIgnored(stdout)).toEqual([".env", ".mcp.json", "node_modules"]);
  });

  it("returns nothing when there are no ignored entries", () => {
    expect(parseGitIgnored(" M a.ts\n?? b.ts")).toEqual([]);
  });
});
