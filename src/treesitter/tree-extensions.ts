// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// The CodeMirror 6 wiring for a loaded tree-sitter grammar: one ViewPlugin parses the document and
// produces syntax-highlight decorations; a linter reads the SAME tree for error/missing-node
// diagnostics (no second parse). Highlighting bypasses CodeMirror's Lezer language facet entirely,
// which is what lets one engine cover every language.
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { Extension, RangeSetBuilder } from "@codemirror/state";
import { linter, lintGutter } from "@codemirror/lint";
import type { Tree } from "web-tree-sitter";
import type { LoadedGrammar } from "./loader";
import { makeByteToChar } from "./byte-offsets";
import { captureClass } from "./highlight-map";
import { collectSyntaxErrors } from "./diagnostics";
import { normalizeLang } from "./registry";

type Mark = { from: number; to: number; cls: string };

class TreeHighlighter {
  private tree: Tree | null = null;
  decorations: DecorationSet;

  constructor(view: EditorView, private grammar: LoadedGrammar) {
    this.decorations = this.reparse(view);
  }

  update(u: ViewUpdate): void {
    if (u.docChanged || !this.tree) this.decorations = this.reparse(u.view);
  }

  destroy(): void {
    this.tree?.delete();
    this.tree = null;
  }

  private reparse(view: EditorView): DecorationSet {
    const text = view.state.doc.toString();
    this.tree?.delete();
    this.tree = this.grammar.parser.parse(text);
    if (!this.tree) return Decoration.none;

    const toChar = makeByteToChar(text);
    const marks: Mark[] = [];
    if (this.grammar.query) {
      for (const cap of this.grammar.query.captures(this.tree.rootNode)) {
        const cls = captureClass(cap.name);
        if (!cls) continue;
        const from = toChar(cap.node.startIndex);
        const to = toChar(cap.node.endIndex);
        if (to > from) marks.push({ from, to, cls });
      }
    }
    if (this.grammar.injections) this.highlightInjections(text, toChar, marks);
    if (!marks.length) return Decoration.none;

    // RangeSetBuilder needs ascending `from`. For equal `from`, longer-first so the narrower (more
    // specific) capture is added last and wins the overlap.
    marks.sort((a, b) => a.from - b.from || b.to - a.to);
    const builder = new RangeSetBuilder<Decoration>();
    let last = -1;
    for (const m of marks) {
      if (m.from < last) continue; // never regress; keeps the builder's ordering invariant
      builder.add(m.from, m.to, Decoration.mark({ class: m.cls }));
      last = m.from;
    }
    return builder.finish();
  }

  // Colour embedded-language regions (frontmatter/script/style) with their own grammars, mapping
  // each capture from the region's byte offsets back to absolute document positions.
  private highlightInjections(text: string, toChar: (b: number) => number, marks: Mark[]): void {
    const inj = this.grammar.injections;
    if (!inj || !this.tree) return;
    for (const match of inj.query.matches(this.tree.rootNode)) {
      const content = match.captures.find((c) => c.name === "injection.content");
      if (!content) continue;
      const props = match.setProperties as Record<string, string> | undefined;
      const lang =
        props?.["injection.language"] ??
        match.captures.find((c) => c.name === "injection.language")?.node.text;
      if (!lang) continue;
      const injected = inj.grammars.get(normalizeLang(lang));
      if (!injected || !injected.query) continue;
      const startChar = toChar(content.node.startIndex);
      const regionText = text.slice(startChar, toChar(content.node.endIndex));
      const sub = injected.parser.parse(regionText);
      if (!sub) continue;
      try {
        const subToChar = makeByteToChar(regionText);
        for (const cap of injected.query.captures(sub.rootNode)) {
          const cls = captureClass(cap.name);
          if (!cls) continue;
          const from = startChar + subToChar(cap.node.startIndex);
          const to = startChar + subToChar(cap.node.endIndex);
          if (to > from) marks.push({ from, to, cls });
        }
      } finally {
        sub.delete();
      }
    }
  }
}

// Build the CM6 extension set (highlighting + diagnostics) for a grammar. The highlighter owns its
// own parse for decorations; the linter parses independently (debounced) for diagnostics — kept
// decoupled so neither depends on the other's plugin instance.
export function treeSitterExtensions(grammar: LoadedGrammar): Extension {
  const highlighter = ViewPlugin.define((view) => new TreeHighlighter(view, grammar), {
    decorations: (v) => v.decorations,
  });
  const diagnostics = linter(
    (view) => {
      const text = view.state.doc.toString();
      const tree = grammar.parser.parse(text);
      if (!tree) return [];
      try {
        return collectSyntaxErrors(tree, text);
      } finally {
        tree.delete();
      }
    },
    { delay: 300 },
  );
  return [highlighter, diagnostics, lintGutter()];
}
