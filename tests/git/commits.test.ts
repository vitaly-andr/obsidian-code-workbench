// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { describe, it, expect } from "vitest";
import { parseCommits } from "../../src/git/log";

const US = "\x1f";
const RS = "\x1e";
const rec = (fields: string[]): string => fields.join(US) + RS;

describe("parseCommits", () => {
  it("parses hash, parents, refs, and metadata; git separates records with a newline", () => {
    const stdout = [
      rec(["aaa111", "bbb222 ccc333", "HEAD -> main, tag: v1", "Alice", "2026-06-24T10:00:00+00:00", "Merge work"]),
      rec(["bbb222", "ddd444", "", "Bob", "2026-06-23T09:00:00+00:00", "A feature"]),
      rec(["ddd444", "", "origin/main", "Carol", "2026-06-22T08:00:00+00:00", "Root commit"]),
    ].join("\n");

    const commits = parseCommits(stdout);
    expect(commits.length).toBe(3);

    expect(commits[0].hash).toBe("aaa111");
    expect(commits[0].parents).toEqual(["bbb222", "ccc333"]); // merge: two parents
    expect(commits[0].refs).toEqual([
      { name: "HEAD", kind: "head" },
      { name: "main", kind: "branch" },
      { name: "v1", kind: "tag" },
    ]);
    expect(commits[0].subject).toBe("Merge work");

    expect(commits[1].parents).toEqual(["ddd444"]);
    expect(commits[1].refs).toEqual([]);

    expect(commits[2].parents).toEqual([]); // root: no parents
    expect(commits[2].refs).toEqual([{ name: "origin/main", kind: "remote" }]);
  });
});
