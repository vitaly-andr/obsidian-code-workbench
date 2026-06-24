// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { describe, it, expect } from "vitest";
import { parseBlame } from "../../src/git/log";
import { annotationText, relativeAge } from "../../src/views/blame-annotation";

// One `git blame --line-porcelain` record: a "<sha> <orig> <final> [group]" header, key-value
// lines, then a tab-prefixed content line that closes the record.
const block = (
  sha: string,
  finalLine: number,
  fields: { author?: string; time?: number; summary?: string },
  content: string,
): string => {
  const lines = [`${sha} ${finalLine} ${finalLine} 1`];
  if (fields.author !== undefined) {
    lines.push(`author ${fields.author}`);
    lines.push("author-mail <x@y.z>");
    lines.push(`author-time ${fields.time ?? 0}`);
    lines.push("author-tz +0000");
    lines.push(`committer ${fields.author}`);
    lines.push(`committer-time ${fields.time ?? 0}`);
  }
  if (fields.summary !== undefined) lines.push(`summary ${fields.summary}`);
  lines.push("filename foo.ts");
  lines.push(`\t${content}`);
  return lines.join("\n");
};

const ZERO = "0".repeat(40);

describe("parseBlame", () => {
  it("parses committed and uncommitted lines from line-porcelain output", () => {
    const stdout = [
      block("a".repeat(40), 1, { author: "Alice", time: 1781850862, summary: "Initial commit" }, "const x = 1;"),
      block(ZERO, 2, { author: "Not Committed Yet", time: 1782292102, summary: "Version control..." }, "const y = 2;"),
    ].join("\n");

    const blame = parseBlame(stdout);
    expect(blame.length).toBe(2);

    expect(blame[0]).toEqual({
      line: 1,
      hash: "a".repeat(40),
      author: "Alice",
      epoch: 1781850862,
      summary: "Initial commit",
      uncommitted: false,
    });

    expect(blame[1].line).toBe(2);
    expect(blame[1].hash).toBe(ZERO);
    expect(blame[1].uncommitted).toBe(true); // the all-zero sha marks a working-tree edit
  });

  it("returns an empty array for empty output", () => {
    expect(parseBlame("")).toEqual([]);
  });
});

describe("relativeAge", () => {
  const NOW = 1_000_000_000_000; // fixed "now" in ms
  const ago = (sec: number): number => Math.floor(NOW / 1000) - sec;

  it("buckets durations into compact units", () => {
    expect(relativeAge(ago(10), NOW)).toBe("just now");
    expect(relativeAge(ago(120), NOW)).toBe("2m");
    expect(relativeAge(ago(3 * 3600), NOW)).toBe("3h");
    expect(relativeAge(ago(5 * 86400), NOW)).toBe("5d");
    expect(relativeAge(ago(14 * 86400), NOW)).toBe("2w");
    expect(relativeAge(ago(60 * 86400), NOW)).toBe("2mo");
    expect(relativeAge(ago(800 * 86400), NOW)).toBe("2y");
  });

  it("never goes negative for a future timestamp", () => {
    expect(relativeAge(ago(-100), NOW)).toBe("just now");
  });
});

describe("annotationText", () => {
  const NOW = 1_000_000_000_000;

  it("formats author · age · summary for a commit", () => {
    const text = annotationText(
      { line: 1, hash: "a".repeat(40), author: "Alice", epoch: Math.floor(NOW / 1000) - 86400, summary: "Add feature", uncommitted: false },
      NOW,
    );
    expect(text).toBe("aaaaaaa · Alice · 1d · Add feature");
  });

  it("shows a plain marker for an uncommitted line", () => {
    const text = annotationText(
      { line: 2, hash: ZERO, author: "Not Committed Yet", epoch: 0, summary: "", uncommitted: true },
      NOW,
    );
    expect(text).toBe("You · uncommitted");
  });
});
