// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { beforeEach, describe, expect, it } from "vitest";
import { appendToNote } from "../../src/vault-tools/write/append-to-note";
import { createNote } from "../../src/vault-tools/write/create-note";
import { deleteNote } from "../../src/vault-tools/write/delete-note";
import { renameNote } from "../../src/vault-tools/write/rename-note";
import { updateFrontmatter } from "../../src/vault-tools/write/update-frontmatter";
import { ToolResult } from "../../src/vault-tools/types";
import { makeVaultContext, MockVault, stubApproval } from "../mocks/vault";

const signal = new AbortController().signal;
function out(result: ToolResult): any {
  return JSON.parse(result.content[0].text);
}

describe("write tools (T023)", () => {
  let vault: MockVault;
  beforeEach(() => {
    vault = new MockVault();
  });

  describe("createNote", () => {
    it("creates after approval, honoring edits from the diff", async () => {
      const ctx = makeVaultContext(vault, stubApproval({ contentApproved: true, editTo: "EDITED BODY" }));
      const res = out(await createNote({ path: "New.md", content: "proposed" }, ctx, signal));
      expect(res).toEqual({ path: "New.md", created: true });
      expect(vault.created).toEqual([{ path: "New.md", content: "EDITED BODY" }]);
    });

    it("refuses to overwrite an existing file", async () => {
      vault.addFile("Exists.md");
      const ctx = makeVaultContext(vault, stubApproval({ contentApproved: true }));
      expect(out(await createNote({ path: "Exists.md" }, ctx, signal))).toEqual({ error: "already exists" });
      expect(vault.created).toEqual([]);
    });

    it("leaves the vault unchanged when the user cancels", async () => {
      const ctx = makeVaultContext(vault, stubApproval({ contentApproved: false }));
      expect(out(await createNote({ path: "New.md" }, ctx, signal))).toEqual({ cancelled: true });
      expect(vault.created).toEqual([]);
    });

    it("refuses an out-of-vault path", async () => {
      const ctx = makeVaultContext(vault, stubApproval({ contentApproved: true }));
      expect(out(await createNote({ path: "../escape.md" }, ctx, signal))).toEqual({ error: "invalid path" });
    });
  });

  describe("appendToNote", () => {
    it("appends without overwriting the body, via the vault API", async () => {
      vault.addFile("Note.md", { content: "base" });
      const ctx = makeVaultContext(vault, stubApproval({ contentApproved: true }));
      const res = out(await appendToNote({ path: "Note.md", content: "\nmore" }, ctx, signal));
      expect(res).toEqual({ path: "Note.md", appended: true });
      expect(vault.content.get("Note.md")).toBe("base\nmore");
    });

    it("writes the user's edited diff content, not just the raw append", async () => {
      vault.addFile("Note.md", { content: "base" });
      const ctx = makeVaultContext(vault, stubApproval({ contentApproved: true, editTo: "base + my edit" }));
      await appendToNote({ path: "Note.md", content: "\nraw" }, ctx, signal);
      expect(vault.content.get("Note.md")).toBe("base + my edit");
    });

    it("prepends when asked", async () => {
      vault.addFile("Note.md", { content: "base" });
      const ctx = makeVaultContext(vault, stubApproval({ contentApproved: true }));
      await appendToNote({ path: "Note.md", content: "top\n", position: "prepend" }, ctx, signal);
      expect(vault.content.get("Note.md")).toBe("top\nbase");
    });

    it("not-found for a missing note; cancel leaves it unchanged", async () => {
      const missingCtx = makeVaultContext(vault, stubApproval({ contentApproved: true }));
      expect(out(await appendToNote({ path: "Gone.md", content: "x" }, missingCtx, signal))).toEqual({
        error: "not found",
      });

      vault.addFile("Note.md", { content: "base" });
      const cancelCtx = makeVaultContext(vault, stubApproval({ contentApproved: false }));
      expect(out(await appendToNote({ path: "Note.md", content: "x" }, cancelCtx, signal))).toEqual({
        cancelled: true,
      });
      expect(vault.content.get("Note.md")).toBe("base");
    });
  });

  describe("updateFrontmatter", () => {
    it("merges frontmatter via processFrontMatter, leaving the body untouched", async () => {
      vault.addFile("M.md", { content: "---\ntitle: Old\n---\nBody text", frontmatter: { title: "Old" } });
      const ctx = makeVaultContext(vault, stubApproval({ contentApproved: true }));
      const res = out(await updateFrontmatter({ path: "M.md", fields: { author: "me" } }, ctx, signal));
      expect(res.frontmatter).toEqual({ title: "Old", author: "me" });
      expect(vault.frontmatters.get("M.md")).toEqual({ title: "Old", author: "me" });
      // Body content is never overwritten by this tool.
      expect(vault.content.get("M.md")).toBe("---\ntitle: Old\n---\nBody text");
    });

    it("applies the frontmatter the user edited in the diff", async () => {
      vault.addFile("M.md", { content: "---\ntitle: Old\n---\nBody", frontmatter: { title: "Old" } });
      const edited = '---\ntitle: "Edited"\nextra: "x"\n---\nBody';
      const ctx = makeVaultContext(vault, stubApproval({ contentApproved: true, editTo: edited }));
      const res = out(await updateFrontmatter({ path: "M.md", fields: { author: "me" } }, ctx, signal));
      expect(res.frontmatter).toEqual({ title: "Edited", extra: "x" });
      expect(vault.frontmatters.get("M.md")).toEqual({ title: "Edited", extra: "x" });
    });

    it("cancel leaves frontmatter unchanged", async () => {
      vault.addFile("M.md", { content: "x", frontmatter: { title: "Old" } });
      const ctx = makeVaultContext(vault, stubApproval({ contentApproved: false }));
      expect(out(await updateFrontmatter({ path: "M.md", fields: { author: "me" } }, ctx, signal))).toEqual({
        cancelled: true,
      });
      expect(vault.frontmatters.get("M.md")).toEqual({ title: "Old" });
    });
  });

  describe("renameNote", () => {
    it("renames through the vault API (link-preserving) after confirm", async () => {
      vault.addFile("Old.md", { content: "c" });
      const ctx = makeVaultContext(vault, stubApproval({ confirmApproved: true }));
      const res = out(await renameNote({ path: "Old.md", newPath: "New.md" }, ctx, signal));
      expect(res).toEqual({ oldPath: "Old.md", newPath: "New.md", linksUpdated: true });
      expect(vault.renamed).toEqual([{ from: "Old.md", to: "New.md" }]);
    });

    it("refuses when the destination exists", async () => {
      vault.addFile("Old.md");
      vault.addFile("New.md");
      const ctx = makeVaultContext(vault, stubApproval({ confirmApproved: true }));
      expect(out(await renameNote({ path: "Old.md", newPath: "New.md" }, ctx, signal))).toEqual({
        error: "destination exists",
      });
      expect(vault.renamed).toEqual([]);
    });

    it("cancel leaves the note in place", async () => {
      vault.addFile("Old.md");
      const ctx = makeVaultContext(vault, stubApproval({ confirmApproved: false }));
      expect(out(await renameNote({ path: "Old.md", newPath: "New.md" }, ctx, signal))).toEqual({
        cancelled: true,
      });
      expect(vault.renamed).toEqual([]);
    });
  });

  describe("deleteNote", () => {
    it("moves to trash (recoverable) after confirm", async () => {
      vault.addFile("Del.md");
      const ctx = makeVaultContext(vault, stubApproval({ confirmApproved: true }));
      const res = out(await deleteNote({ path: "Del.md" }, ctx, signal));
      expect(res).toEqual({ path: "Del.md", trashed: true });
      expect(vault.trashed).toEqual(["Del.md"]);
    });

    it("not-found for a missing note; cancel keeps it", async () => {
      const missingCtx = makeVaultContext(vault, stubApproval({ confirmApproved: true }));
      expect(out(await deleteNote({ path: "Gone.md" }, missingCtx, signal))).toEqual({ error: "not found" });

      vault.addFile("Keep.md");
      const cancelCtx = makeVaultContext(vault, stubApproval({ confirmApproved: false }));
      expect(out(await deleteNote({ path: "Keep.md" }, cancelCtx, signal))).toEqual({ cancelled: true });
      expect(vault.trashed).toEqual([]);
    });
  });
});
