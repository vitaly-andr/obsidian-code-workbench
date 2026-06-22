// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { parseYaml, stringifyYaml } from "obsidian";
import { resolveVaultFile } from "../guards";
import { fail, ok, ToolHandler } from "../types";

// Parse the frontmatter object the user approved out of the (possibly edited) diff content.
function frontmatterFromApproved(content: string): Record<string, unknown> | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!match) return null;
  try {
    const parsed = parseYaml(match[1]);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

// Update a note's YAML frontmatter, leaving the body untouched. Previews the new frontmatter block as
// an editable diff (rendered with Obsidian's own YAML serializer); on Keep it applies what the user
// approved — including edits they made in the diff — via processFrontMatter, which keeps the body intact.
export const updateFrontmatter: ToolHandler = async (args, ctx, signal) => {
  const { app } = ctx;
  const file = resolveVaultFile(app, String(args.path ?? ""));
  if (!file) return fail("not found");
  if (typeof args.fields !== "object" || args.fields === null || Array.isArray(args.fields)) {
    return fail("invalid path");
  }
  const fields = args.fields as Record<string, unknown>;
  const merge = args.merge !== false;

  const current = await app.vault.cachedRead(file);
  const cache = app.metadataCache.getFileCache(file);
  const existing = cache?.frontmatter ?? {};
  const merged = merge ? { ...existing, ...fields } : { ...fields };

  // Build the preview by replacing the existing frontmatter block precisely (located via the cache's
  // frontmatterPosition, so a body that merely starts with "---" is never mistaken for frontmatter).
  const block = `---\n${stringifyYaml(merged)}---\n`;
  const fmPos = cache?.frontmatterPosition;
  const preview = fmPos ? `${block}${current.slice(fmPos.end.offset).replace(/^\r?\n/, "")}` : `${block}${current}`;

  const review = await ctx.approval.reviewContent(
    { path: file.path, oldContent: current, newContent: preview, tabName: `Frontmatter ${file.path}` },
    signal,
  );
  if (!review.approved) return ok({ cancelled: true });

  // Apply exactly the frontmatter the user approved, parsed back from the edited diff. If their edits
  // no longer parse as a frontmatter block, refuse rather than silently fall back to the computed
  // merge (which would discard what they typed). processFrontMatter rewrites only the frontmatter.
  const approved = frontmatterFromApproved(review.finalContent);
  if (!approved) return fail("could not parse the approved frontmatter");
  await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
    for (const key of Object.keys(fm)) delete fm[key];
    Object.assign(fm, approved);
  });
  return ok({ path: file.path, frontmatter: approved });
};
