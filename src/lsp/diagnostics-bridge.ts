// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Route the active LSP diagnostics into the /ide getDiagnostics handler (contracts/getdiagnostics-parity.md,
// FR-026). T028.
//
// Diagnostics arrive from each server via `textDocument/publishDiagnostics`; the controller registers a
// notification handler (extensions.ts) that records the raw LSP diagnostics here, keyed by file URI,
// without disturbing the editor display (serverDiagnostics still renders them). The getDiagnostics tool
// reads this bridge through a provider seam (src/tools/diagnostics.ts), gated by `exposeToAgent`.
//
// Each diagnostic renders to one line in the standard GCC/Clang compiler-diagnostic format
// (`<path>:<line>:<col>: <severity>: <message>`) — the de-facto convention, not any editor's private
// string. Principle I guards the response *shape* (SPEC §7.5), which is unchanged; the text is free-form.

import { toOneBased } from "./offsets";

// The minimal LSP Diagnostic shape we consume. Declared locally so the bridge does not pull the full
// vscode-languageserver-protocol types into the bundle.
export interface LspPosition {
  line: number; // 0-based
  character: number; // 0-based, UTF-16 code units
}

export interface LspDiagnostic {
  range: { start: LspPosition; end?: LspPosition };
  // LSP DiagnosticSeverity: 1=error, 2=warning, 3=information, 4=hint. Optional per spec.
  severity?: number;
  message: string;
}

// LSP severity → the word used in the GCC/Clang line (note: 3 renders as "info", per the contract).
const SEVERITY_WORD: Record<number, string> = { 1: "error", 2: "warning", 3: "info", 4: "hint" };

export function severityWord(severity?: number): string {
  return (severity !== undefined && SEVERITY_WORD[severity]) || "error";
}

// Render one diagnostic as `<path>:<line>:<col>: <severity>: <message>`. `line`/`col` are 1-based from
// the LSP range start (UTF-16 units, via offsets.ts — correct for multibyte text, SC-007); `message`
// has its newlines collapsed to single spaces so the whole diagnostic stays on one line.
export function renderDiagnosticLine(path: string, diagnostic: LspDiagnostic): string {
  const { line, column } = toOneBased(diagnostic.range.start);
  const message = diagnostic.message.replace(/\s*\r?\n\s*/g, " ").trim();
  return `${path}:${line}:${column}: ${severityWord(diagnostic.severity)}: ${message}`;
}

// Convert a file:// URI to an absolute filesystem path (best-effort; null for non-file URIs).
export function fileUriToPath(uri: string): string | null {
  if (!uri.startsWith("file://")) return null;
  try {
    return decodeURIComponent(uri.replace(/^file:\/\//, ""));
  } catch {
    return null;
  }
}

// Collects the latest diagnostics per file URI. A publish with an empty array clears that file.
export class DiagnosticsBridge {
  private readonly byUri = new Map<string, readonly LspDiagnostic[]>();

  record(uri: string, diagnostics: readonly LspDiagnostic[]): void {
    if (diagnostics.length === 0) this.byUri.delete(uri);
    else this.byUri.set(uri, diagnostics);
  }

  clearUri(uri: string): void {
    this.byUri.delete(uri);
  }

  clear(): void {
    this.byUri.clear();
  }

  // Render all recorded diagnostics (optionally filtered to one URI) as GCC/Clang lines, using
  // `toRelative` to present a vault-relative path (falling back to the absolute path / raw URI).
  render(toRelative: (absPath: string) => string | null, uri?: string): string[] {
    const lines: string[] = [];
    for (const [u, diagnostics] of this.byUri) {
      if (uri && u !== uri) continue;
      const abs = fileUriToPath(u);
      const path = (abs && toRelative(abs)) || abs || u;
      for (const d of diagnostics) lines.push(renderDiagnosticLine(path, d));
    }
    return lines;
  }
}
