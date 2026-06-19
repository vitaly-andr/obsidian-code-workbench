// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { App, FileSystemAdapter } from "obsidian";
import * as path from "path";

// Resolve the vault's absolute root path.
// R4: the public API is FileSystemAdapter.getBasePath(); `basePath` is internal.
// Some plugins (e.g. obsidian-git) wrap the adapter so `instanceof` can fail —
// hence the guarded property fallback. Returns null when no path is resolvable.
export function vaultBasePath(app: App): string | null {
  const adapter = app.vault.adapter;
  if (adapter instanceof FileSystemAdapter) {
    return adapter.getBasePath();
  }
  const maybe = adapter as unknown as { basePath?: unknown };
  if (typeof maybe.basePath === "string") {
    return maybe.basePath;
  }
  return null;
}

// Minimal file:// URI for an absolute path (POSIX-style paths; Windows drive
// paths are prefixed with an extra slash to match the reference behavior).
export function toFileUri(absPath: string): string {
  const normalized = absPath.replace(/\\/g, "/");
  return normalized.startsWith("/") ? `file://${normalized}` : `file:///${normalized}`;
}

// Join the vault root with a vault-relative path → absolute path.
export function absoluteForVaultPath(app: App, relPath: string): string | null {
  const base = vaultBasePath(app);
  if (!base) return null;
  return base.replace(/[\\/]+$/, "") + "/" + relPath.replace(/^[\\/]+/, "");
}

// Map an absolute path back to a vault-relative path, or null if outside the vault.
export function vaultPathForAbsolute(app: App, absPath: string): string | null {
  const base = vaultBasePath(app);
  if (!base) return null;
  // L4: normalize away "." / ".." segments before the prefix check so a crafted
  // path can't escape the vault (e.g. "<vault>/../secret"). Lexical only — the
  // Obsidian vault API stays the second guard (symlinks).
  const b = path.posix.normalize(base.replace(/\\/g, "/")).replace(/\/+$/, "");
  const a = path.posix.normalize(absPath.replace(/\\/g, "/"));
  if (a === b) return "";
  if (a.startsWith(b + "/")) return a.slice(b.length + 1);
  return null;
}
