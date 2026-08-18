// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Setting definitions address a value by a key, and the tab resolves that key against the plugin's
// settings object. Most keys are plain (`gitBlame`), the editor-LSP ones are nested (`lsp.folding`)
// — the persisted shape predates this indirection and is not reshaped for it.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Reads a dotted path. Returns undefined when any segment along the way is missing. */
export function getByPath(root: unknown, path: string): unknown {
  let current: unknown = root;
  for (const segment of path.split(".")) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

/**
 * Writes a dotted path in place. A path whose parent does not exist is left alone rather than
 * created: settings shapes come from DEFAULT_SETTINGS, so a missing parent means a stale or
 * misspelled key, and inventing the branch would persist a shape nothing reads.
 */
export function setByPath(root: unknown, path: string, value: unknown): void {
  const segments = path.split(".");
  const last = segments.pop();
  if (!last) return;
  let current: unknown = root;
  for (const segment of segments) {
    if (!isRecord(current)) return;
    current = current[segment];
  }
  if (!isRecord(current)) return;
  current[last] = value;
}
