// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { beforeEach, describe, expect, it } from "vitest";
import { __state as dailyState } from "obsidian-daily-notes-interface";
import { getActiveNoteContent } from "../../src/vault-tools/read/get-active-note-content";
import { getBacklinks } from "../../src/vault-tools/read/get-backlinks";
import { getDailyNote } from "../../src/vault-tools/read/get-daily-note";
import { getFrontmatter } from "../../src/vault-tools/read/get-frontmatter";
import { getOutgoingLinks } from "../../src/vault-tools/read/get-outgoing-links";
import { listFilesInFolder } from "../../src/vault-tools/read/list-files-in-folder";
import { resolveWikilink } from "../../src/vault-tools/read/resolve-wikilink";
import { searchVault } from "../../src/vault-tools/read/search-vault";
import { ToolResult } from "../../src/vault-tools/types";
import { makeVaultContext, MockVault, stubApproval } from "../mocks/vault";

const signal = new AbortController().signal;
const approval = stubApproval({});
function out(result: ToolResult): any {
  return JSON.parse(result.content[0].text);
}

describe("read tools (T013)", () => {
  let vault: MockVault;
  beforeEach(() => {
    vault = new MockVault();
  });

  it("getActiveNoteContent returns the active note, or an error when none", async () => {
    const ctx = makeVaultContext(vault, approval);
    expect(out(await getActiveNoteContent({}, ctx, signal))).toEqual({ error: "no active note" });

    const file = vault.addFile("Note.md", { content: "hello" });
    vault.setActive(file);
    expect(out(await getActiveNoteContent({}, ctx, signal))).toEqual({ path: "Note.md", content: "hello" });
  });

  it("getBacklinks reverses resolvedLinks, gates on indexing, and reports not-found", async () => {
    vault.addFile("Target.md");
    vault.addFile("A.md");
    vault.addFile("B.md");
    vault.resolvedLinks["A.md"] = { "Target.md": 2 };
    vault.resolvedLinks["B.md"] = { "Target.md": 1 };

    // Indexing gate.
    const indexing = out(await getBacklinks({ path: "Target.md" }, makeVaultContext(vault, approval, false), signal));
    expect(indexing).toEqual({ error: "indexing" });

    const ctx = makeVaultContext(vault, approval, true);
    const res = out(await getBacklinks({ path: "Target.md" }, ctx, signal));
    expect(res.backlinks).toEqual([
      { path: "A.md", count: 2 },
      { path: "B.md", count: 1 },
    ]);
    expect(res.truncated).toBe(false);

    expect(out(await getBacklinks({ path: "Missing.md" }, ctx, signal))).toEqual({ error: "not found" });
  });

  it("getBacklinks truncates at the cap", async () => {
    vault.addFile("Hub.md");
    for (let i = 0; i < 150; i++) {
      const src = `n${i}.md`;
      vault.addFile(src);
      vault.resolvedLinks[src] = { "Hub.md": 1 };
    }
    const res = out(await getBacklinks({ path: "Hub.md" }, makeVaultContext(vault, approval, true), signal));
    expect(res.backlinks.length).toBe(100);
    expect(res.truncated).toBe(true);
  });

  it("getOutgoingLinks resolves links/embeds/frontmatter and lists unresolved", async () => {
    vault.addFile("Dest.md");
    vault.addFile("Source.md", {
      links: [
        { link: "Dest", displayText: "Destination", kind: "link" },
        { link: "Ghost", kind: "link" },
      ],
    });
    vault.unresolvedLinks["Source.md"] = { Ghost: 1 };
    const ctx = makeVaultContext(vault, approval);
    const res = out(await getOutgoingLinks({ path: "Source.md" }, ctx, signal));
    expect(res.links[0]).toEqual({ link: "Dest", resolvedPath: "Dest.md", displayText: "Destination", kind: "link" });
    expect(res.unresolved).toEqual(["Ghost"]);
    expect(out(await getOutgoingLinks({ path: "Nope.md" }, ctx, signal))).toEqual({ error: "not found" });
  });

  it("resolveWikilink resolves targets and flags ambiguity", async () => {
    vault.addFile("folderA/Topic.md");
    const ctx = makeVaultContext(vault, approval);
    const single = out(await resolveWikilink({ linkpath: "Topic#Heading|Alias" }, ctx, signal));
    expect(single.target).toBe("folderA/Topic.md");
    expect(single.candidates).toBeUndefined();

    vault.addFile("folderB/Topic.md");
    const ambiguous = out(await resolveWikilink({ linkpath: "Topic" }, ctx, signal));
    expect(ambiguous.candidates).toEqual(["folderA/Topic.md", "folderB/Topic.md"]);
  });

  it("getFrontmatter returns the parsed object or not-found", async () => {
    vault.addFile("Meta.md", { frontmatter: { title: "X", tags: ["a"] } });
    const ctx = makeVaultContext(vault, approval);
    expect(out(await getFrontmatter({ path: "Meta.md" }, ctx, signal))).toEqual({
      path: "Meta.md",
      frontmatter: { title: "X", tags: ["a"] },
    });
    expect(out(await getFrontmatter({ path: "Gone.md" }, ctx, signal))).toEqual({ error: "not found" });
  });

  it("searchVault ranks title/frontmatter matches and truncates at the limit", async () => {
    vault.addFile("Title Match.md", { content: "nothing relevant" });
    vault.addFile("Other.md", { frontmatter: { topic: "widgets" } });
    const ctx = makeVaultContext(vault, approval);

    const byTitle = out(await searchVault({ query: "Title Match" }, ctx, signal));
    expect(byTitle.results[0].path).toBe("Title Match.md");

    // Bodies are not searched (that is grep's job); a frontmatter field still matches.
    const byFrontmatter = out(await searchVault({ query: "widgets" }, ctx, signal));
    expect(
      byFrontmatter.results.some((r: any) => r.path === "Other.md" && r.matchedIn === "frontmatter"),
    ).toBe(true);

    for (let i = 0; i < 25; i++) vault.addFile(`keyword-${i}.md`);
    const capped = out(await searchVault({ query: "keyword" }, ctx, signal));
    expect(capped.results.length).toBe(20);
    expect(capped.truncated).toBe(true);

    const withLimit = out(await searchVault({ query: "keyword", limit: 5 }, ctx, signal));
    expect(withLimit.results.length).toBe(5);
  });

  it("listFilesInFolder lists children and reports not-found", async () => {
    const folder = vault.addFolder("Projects");
    const child = vault.addFile("Projects/Plan.md");
    const sub = vault.addFolder("Projects/Sub");
    folder.children = [child, sub];
    const ctx = makeVaultContext(vault, approval);
    const res = out(await listFilesInFolder({ folder: "Projects" }, ctx, signal));
    expect(res.entries).toEqual([
      { path: "Projects/Plan.md", type: "file" },
      { path: "Projects/Sub", type: "folder" },
    ]);
    expect(out(await listFilesInFolder({ folder: "Ghost" }, ctx, signal))).toEqual({ error: "not found" });
  });

  it('listFilesInFolder treats "", "/", and "." as the vault root', async () => {
    vault.addFile("Top.md");
    vault.addFolder("Sub");
    const ctx = makeVaultContext(vault, approval);
    for (const folder of ["", "/", "."]) {
      const res = out(await listFilesInFolder({ folder }, ctx, signal));
      expect(res.entries).toContainEqual({ path: "Top.md", type: "file" });
      expect(res.entries).toContainEqual({ path: "Sub", type: "folder" });
    }
  });

  it("getDailyNote reports not-configured, then returns the note when configured", async () => {
    const ctx = makeVaultContext(vault, approval);
    dailyState.loaded = false;
    dailyState.resolved = null;
    expect(out(await getDailyNote({}, ctx, signal))).toEqual({ error: "daily notes not configured" });

    const note = vault.addFile("Daily/2026-06-22.md", { content: "today" });
    dailyState.loaded = true;
    dailyState.resolved = note;
    expect(out(await getDailyNote({}, ctx, signal))).toEqual({
      path: "Daily/2026-06-22.md",
      content: "today",
      exists: true,
    });

    dailyState.resolved = null;
    expect(out(await getDailyNote({}, ctx, signal))).toEqual({ exists: false });
    dailyState.loaded = false;
  });
});
