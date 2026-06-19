// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Syntax-error diagnostics from the active Lezer parse tree (the @codemirror/lang-* grammars).
// No language server, no WASM: Lezer is error-tolerant, so its error nodes give syntax-error
// underlines for every bundled lang-* language. Legacy StreamLanguage modes produce no error
// nodes, so they simply yield nothing — which is fine.
import { Extension } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { Diagnostic, linter, lintGutter } from "@codemirror/lint";

const MAX_DIAGNOSTICS = 100;

const lezerSyntaxLinter = linter(
  (view) => {
    const diagnostics: Diagnostic[] = [];
    const docLength = view.state.doc.length;
    syntaxTree(view.state).cursor().iterate((node) => {
      if (!node.type.isError || diagnostics.length >= MAX_DIAGNOSTICS) return;
      // Zero-width error nodes (a missing token) get a 1-char span so the underline shows.
      const to = node.to > node.from ? node.to : Math.min(node.from + 1, docLength);
      diagnostics.push({ from: node.from, to, severity: "error", message: "Syntax error" });
    });
    return diagnostics;
  },
  { delay: 300 },
);

// Underlines + a gutter marker. Meaningful only where a Lezer grammar is active (lang-*);
// legacy modes and plaintext yield nothing.
export const syntaxDiagnostics: Extension = [lezerSyntaxLinter, lintGutter()];
