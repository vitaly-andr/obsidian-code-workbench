// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { describe, it, expect } from "vitest";
import { parseBranch } from "../../src/git/log";

describe("parseBranch", () => {
  it("named branch", () => {
    expect(parseBranch({ repoState: "ok", symbolicRef: "main", symbolicRefCode: 0, shortId: null }))
      .toEqual({ kind: "branch", label: "main" });
  });
  it("detached HEAD → short id", () => {
    expect(parseBranch({ repoState: "ok", symbolicRef: "", symbolicRefCode: 1, shortId: "a1b2c3d" }))
      .toEqual({ kind: "detached", label: "@a1b2c3d" });
  });
  it("unborn branch (empty repo, symbolic-ref still resolves)", () => {
    expect(parseBranch({ repoState: "empty", symbolicRef: "main", symbolicRefCode: 0, shortId: null }))
      .toEqual({ kind: "branch", label: "main" });
  });
  it("not a repository → no git", () => {
    expect(parseBranch({ repoState: "not-a-repo", symbolicRef: "", symbolicRefCode: 1, shortId: null }))
      .toEqual({ kind: "none", label: "no git" });
  });
  it("git unavailable → no git", () => {
    expect(parseBranch({ repoState: "unreadable", symbolicRef: "", symbolicRefCode: 1, shortId: null }))
      .toEqual({ kind: "none", label: "no git" });
  });
  it("ok but nothing resolvable → no git", () => {
    expect(parseBranch({ repoState: "ok", symbolicRef: "", symbolicRefCode: 1, shortId: null }))
      .toEqual({ kind: "none", label: "no git" });
  });
});
