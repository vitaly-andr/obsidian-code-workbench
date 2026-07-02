// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Pure mapping from an LSP textDocument/inlayHint response to the editor's widget placement specs
// (010, data-model.md). No CodeMirror / Obsidian import, so this is unit-testable without a live
// server. Local, minimal LSP type declaration (same approach as extensions.ts's DiagnosticReport and
// highlight.ts's DocumentHighlight) so the bundle does not pull the full
// vscode-languageserver-protocol types for one shape.

import { isCurrentPosition, lspPositionToOffset, type LspPosition } from "./offsets";

// An InlayHintLabelPart's other fields (tooltip, location, command — for a resolved, interactive
// label) are ignored in v1 (FR-007: inlayHint/resolve and hint commands are out of scope).
export interface LspInlayHintLabelPart {
  value: string;
}

export type LspInlayHintLabel = string | LspInlayHintLabelPart[];

// InlayHintKind (LSP): 1 Type, 2 Parameter. `kind` is optional — a server may not classify.
export interface LspInlayHint {
  position: LspPosition;
  label: LspInlayHintLabel;
  kind?: number;
  paddingLeft?: boolean;
  paddingRight?: boolean;
}

export type InlayHintKind = "type" | "parameter" | "other";

// The mapper's output (data-model.md → PlacedHint).
export interface PlacedHint {
  offset: number;
  label: string;
  kind: InlayHintKind;
  paddingLeft: boolean;
  paddingRight: boolean;
}

function toKind(kind: number | undefined): InlayHintKind {
  if (kind === 1) return "type";
  if (kind === 2) return "parameter";
  return "other"; // missing kind
}

// A string label is used as-is; an InlayHintLabelPart[] is flattened by concatenating each part's
// `value` (data-model.md — the interactive part fields are ignored in v1).
function flattenLabel(label: LspInlayHintLabel): string {
  return typeof label === "string" ? label : label.map((part) => part.value).join("");
}

// Convert the raw server response + the current document into editor-ready hints (data-model.md):
// position via offsets.ts (multibyte-safe, FR-006); a hint whose position no longer addresses real
// content in the current doc is dropped (the same stale-response guard 009's highlight.ts uses);
// server order preserved.
export function mapInlayHints(raw: readonly LspInlayHint[], doc: string): PlacedHint[] {
  const hints: PlacedHint[] = [];
  for (const h of raw) {
    if (!isCurrentPosition(doc, h.position)) continue;
    hints.push({
      offset: lspPositionToOffset(doc, h.position),
      label: flattenLabel(h.label),
      kind: toKind(h.kind),
      paddingLeft: h.paddingLeft ?? false,
      paddingRight: h.paddingRight ?? false,
    });
  }
  return hints;
}
