// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Syntax-error diagnostics straight from a tree-sitter parse tree. Unlike the Lezer linter (which
// only sees the bundled lang-* grammars), this works for every tree-sitter language — including the
// ones that are StreamLanguage-only today (bash, ruby, lua, swift…) and so have no error underlines.
import { Diagnostic } from "@codemirror/lint";
import type { Tree } from "web-tree-sitter";
import { makeByteToChar } from "./byte-offsets";

const MAX_DIAGNOSTICS = 100;

// Walk the tree collecting ERROR and MISSING nodes as CodeMirror diagnostics. Positions are
// translated from tree-sitter's UTF-8 byte offsets to CodeMirror's UTF-16 char positions.
// Pruning: a clean subtree has hasError === false, so whole branches are skipped; we stop at the
// first error/missing node on each path rather than descending into the broken fragment.
export function collectSyntaxErrors(tree: Tree, text: string): Diagnostic[] {
  const toChar = makeByteToChar(text);
  const docLen = text.length;
  const out: Diagnostic[] = [];
  const cursor = tree.walk();

  const visit = (): void => {
    if (out.length >= MAX_DIAGNOSTICS) return;
    const node = cursor.currentNode;
    if (node.isError || node.isMissing) {
      const from = toChar(node.startIndex);
      // A MISSING node is zero-width; give it a 1-char span so the underline is visible.
      let to = toChar(node.endIndex);
      if (to <= from) to = Math.min(from + 1, docLen);
      out.push({
        from,
        to,
        severity: "error",
        message: node.isMissing ? `Missing "${node.type}"` : "Syntax error",
      });
      return; // don't descend into the erroneous fragment
    }
    if (!node.hasError) return; // clean branch — nothing broken inside
    if (cursor.gotoFirstChild()) {
      do {
        visit();
      } while (cursor.gotoNextSibling());
      cursor.gotoParent();
    }
  };

  visit();
  cursor.delete();
  return out;
}
