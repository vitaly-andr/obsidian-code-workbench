// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { McpResult, textBlock } from "../protocol/mcp";

// §7.5: the special form (a `text` item per diagnostic, not the §6.5 string-in-text wrapper).
//
// Base behaviour is empty: with no LSP module loaded the plugin has no diagnostics of its own. When the
// opt-in editor-LSP module is enabled (005-editor-lsp, FR-026), it installs a provider here that renders
// the active LSP diagnostics in the GCC/Clang line format (contracts/getdiagnostics-parity.md). This seam
// lives in the always-loaded tools layer and only holds a function pointer, so the lazy LSP runtime is
// not pulled into startup; when the module is off (or exposeToAgent is off) the provider is null/empty and
// the response is `{ content: [] }` exactly as before.

export type DiagnosticsProvider = (uri?: string) => string[];

let provider: DiagnosticsProvider | null = null;

// Installed by the LSP controller when it loads; cleared (null) on dispose / when the feature is off.
export function setDiagnosticsProvider(next: DiagnosticsProvider | null): void {
  provider = next;
}

export function getDiagnostics(args: Record<string, unknown> = {}): McpResult {
  const uri = typeof args.uri === "string" ? args.uri : undefined;
  const lines = provider ? provider(uri) : [];
  return { content: lines.map((line) => textBlock(line)) };
}
