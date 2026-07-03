// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Pure mapping from an LSP workspace/symbol response to the palette's item list (013, data-model.md).
// No CodeMirror / Obsidian import, so this is unit-testable without a live server.

import type { LspRange } from "./outline";

// A workspace/symbol result element is SymbolInformation[] | WorkspaceSymbol[] | null. Both shapes
// share name/kind/containerName; they differ only in `location` — a SymbolInformation's location
// always carries a range, while a 3.17 WorkspaceSymbol's may carry only a uri (the range is then
// deferred to an optional workspaceSymbol/resolve, out of scope for v1) — both shapes collapse to
// "uri + an optional range" from the receiving end, so one local type covers both.
export interface LspWorkspaceSymbol {
  name: string;
  kind: number; // SymbolKind
  containerName?: string;
  location?: { uri: string; range?: LspRange };
}

// The mapper's output (data-model.md → WorkspaceSymbolItem). `kind` stays the raw numeric SymbolKind —
// converted to a display label only at render time (the palette), same convention as the raw response.
export interface WorkspaceSymbolItem {
  name: string;
  kind: number;
  containerName?: string;
  uri: string;
  range?: LspRange;
}

// Normalize a workspace/symbol response into palette-ready items: a malformed entry (no `name` or no
// `location.uri`) is dropped; server order (the server's own ranking) is preserved.
export function mapWorkspaceSymbols(
  raw: readonly LspWorkspaceSymbol[] | null | undefined,
): WorkspaceSymbolItem[] {
  if (!raw) return [];
  const items: WorkspaceSymbolItem[] = [];
  for (const s of raw) {
    if (!s.name || !s.location?.uri) continue; // malformed — dropped
    items.push({
      name: s.name,
      kind: s.kind,
      containerName: s.containerName,
      uri: s.location.uri,
      range: s.location.range,
    });
  }
  return items;
}
