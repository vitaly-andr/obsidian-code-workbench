// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { App, normalizePath, TFile, TFolder } from "obsidian";
import { absoluteForVaultPath, vaultPathForAbsolute } from "../util/paths";
import { fail, ToolResult, VaultToolContext } from "./types";

// Link maps (resolvedLinks/backlinks) are populated asynchronously. Before metadataCache emits
// `resolved` they are incomplete, so link tools must report "indexing" rather than wrong answers.
export function indexingGuard(ctx: VaultToolContext): ToolResult | null {
  return ctx.isIndexed() ? null : fail("indexing");
}

// Normalize a caller-supplied vault-relative path and confirm it stays inside the vault.
// Returns the normalized vault-relative path, or null if it escapes the boundary (FR-020).
// Lexical check (".."/absolute escapes); the Obsidian vault API is the second guard (symlinks).
export function scopeVaultPath(app: App, relPath: string): string | null {
  if (typeof relPath !== "string" || relPath.length === 0) return null;
  const normalized = normalizePath(relPath);
  const abs = absoluteForVaultPath(app, normalized);
  if (!abs) return null;
  return vaultPathForAbsolute(app, abs);
}

// Resolve a vault-relative path to an existing markdown/other file, scoped to the vault.
// Returns the TFile, or null when out-of-vault or not a file.
export function resolveVaultFile(app: App, relPath: string): TFile | null {
  const scoped = scopeVaultPath(app, relPath);
  if (scoped === null) return null;
  const file = app.vault.getAbstractFileByPath(scoped);
  return file instanceof TFile ? file : null;
}

// Resolve a vault-relative path to an existing folder, scoped to the vault. "" / "/" / "." -> vault root.
export function resolveVaultFolder(app: App, relPath: string): TFolder | null {
  // The root cases are handled here: scopeVaultPath rejects the empty path, so "" would never reach
  // the scoping branch. Everything else goes through the normal vault-scope guard.
  const trimmed = typeof relPath === "string" ? relPath.trim() : "";
  if (trimmed === "" || trimmed === "/" || trimmed === ".") {
    const root = app.vault.getFolderByPath("/");
    return root instanceof TFolder ? root : null;
  }
  const scoped = scopeVaultPath(app, trimmed);
  if (scoped === null) return null;
  const folder = app.vault.getFolderByPath(scoped);
  return folder instanceof TFolder ? folder : null;
}
