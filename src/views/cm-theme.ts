// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Shared CodeMirror 6 styling + language resolution for CodeView and the diff view.
// Theme-aware: tokens map to Obsidian's `--code-*` CSS variables so the editor matches the
// active Obsidian theme. CM6 core/Lezer stay external (R2); only the language packs are bundled.
import { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { HighlightStyle, StreamLanguage, type StreamParser, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";

import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { cpp } from "@codemirror/lang-cpp";
import { go } from "@codemirror/lang-go";
import { java } from "@codemirror/lang-java";
import { php } from "@codemirror/lang-php";
import { sql } from "@codemirror/lang-sql";
import { xml } from "@codemirror/lang-xml";
import { markdown } from "@codemirror/lang-markdown";
import { yaml } from "@codemirror/lang-yaml";
import { vue } from "@codemirror/lang-vue";
import { sass } from "@codemirror/lang-sass";
import { less } from "@codemirror/lang-less";
import { liquid } from "@codemirror/lang-liquid";
import { wast } from "@codemirror/lang-wast";

import { shell } from "@codemirror/legacy-modes/mode/shell";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import { lua } from "@codemirror/legacy-modes/mode/lua";
import { perl } from "@codemirror/legacy-modes/mode/perl";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { swift } from "@codemirror/legacy-modes/mode/swift";
import { r } from "@codemirror/legacy-modes/mode/r";
import { julia } from "@codemirror/legacy-modes/mode/julia";
import { haskell } from "@codemirror/legacy-modes/mode/haskell";
import { clojure } from "@codemirror/legacy-modes/mode/clojure";
import { diff } from "@codemirror/legacy-modes/mode/diff";
import { c, csharp, kotlin, scala, dart, objectiveC } from "@codemirror/legacy-modes/mode/clike";

const legacy = (mode: StreamParser<unknown>): Extension => StreamLanguage.define(mode);

export function languageExtension(ext: string): Extension | null {
  switch (ext) {
    case "js": case "mjs": case "cjs": return javascript();
    case "jsx": return javascript({ jsx: true });
    case "ts": return javascript({ typescript: true });
    case "tsx": return javascript({ typescript: true, jsx: true });
    case "py": case "pyw": case "pyi": return python();
    case "rs": return rust();
    case "json": case "jsonc": case "json5": return json();
    // erb/astro are HTML-based; the HTML grammar gives good highlighting and (verified) doesn't
    // flag the <% %> / frontmatter as errors.
    // html-based template languages share the HTML Lezer fallback (tree-sitter, when on, is exact).
    case "html": case "htm": case "xhtml": case "erb": case "ejs": case "etlua": case "astro":
    case "twig": case "hbs": case "handlebars": case "blade": return html();
    case "css": return css();
    case "scss": return sass();
    case "sass": return sass({ indented: true });
    case "less": return less();
    case "c": case "h": return legacy(c);
    case "cpp": case "cc": case "cxx": case "hpp": case "hh": case "hxx": return cpp();
    case "go": return go();
    case "java": return java();
    case "kt": case "kts": return legacy(kotlin);
    case "scala": case "sc": return legacy(scala);
    case "cs": return legacy(csharp);
    case "dart": return legacy(dart);
    case "m": case "mm": return legacy(objectiveC);
    case "php": return php();
    case "sql": return sql();
    case "xml": case "xsd": case "xsl": case "svg": case "plist": return xml();
    case "md": case "markdown": return markdown();
    case "yaml": case "yml": return yaml();
    case "vue": return vue();
    case "liquid": return liquid();
    case "wat": case "wast": return wast();
    case "sh": case "bash": case "zsh": case "ksh": return legacy(shell);
    case "rb": case "gemspec": case "rake": case "ru": return legacy(ruby);
    case "lua": return legacy(lua);
    case "pl": case "pm": return legacy(perl);
    case "toml": return legacy(toml);
    case "ini": case "conf": case "cfg": case "properties": return legacy(properties);
    case "swift": return legacy(swift);
    case "r": return legacy(r);
    case "jl": return legacy(julia);
    case "hs": return legacy(haskell);
    case "clj": case "cljs": case "cljc": case "edn": return legacy(clojure);
    case "diff": case "patch": return legacy(diff);
    default: return null;
  }
}

export const obsidianHighlightStyle = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: "var(--code-comment)", fontStyle: "italic" },
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword], color: "var(--code-keyword)" },
  { tag: [t.string, t.special(t.string), t.regexp, t.character], color: "var(--code-string)" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "var(--code-value)" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName], color: "var(--code-function)" },
  { tag: [t.typeName, t.className, t.namespace, t.tagName], color: "var(--code-tag)" },
  { tag: [t.propertyName, t.attributeName], color: "var(--code-property)" },
  { tag: [t.operator, t.derefOperator, t.arithmeticOperator, t.logicOperator, t.compareOperator], color: "var(--code-operator)" },
  { tag: [t.punctuation, t.separator, t.bracket, t.squareBracket, t.paren, t.brace], color: "var(--code-punctuation)" },
  { tag: t.invalid, color: "var(--text-error)" },
]);

export const obsidianHighlighting = syntaxHighlighting(obsidianHighlightStyle, { fallback: true });

export const obsidianEditorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--background-primary)",
    color: "var(--code-normal, var(--text-normal))",
    fontSize: "var(--editor-font-size, var(--font-text-size, 16px))",
  },
  ".cm-scroller": { fontFamily: "var(--font-monospace)", lineHeight: "var(--line-height-normal, 1.5)" },
  ".cm-content": { caretColor: "var(--text-normal)" },
  ".cm-gutters": { backgroundColor: "var(--background-primary)", color: "var(--text-faint)", border: "none" },
  ".cm-activeLine": { backgroundColor: "var(--background-modifier-hover)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--background-modifier-hover)", color: "var(--text-muted)" },
  ".cm-cursor": { borderLeftColor: "var(--text-normal)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--text-selection)",
  },
  // Diagnostic (lint) + hover/LSP tooltips. CodeMirror's view and lint baseThemes give them a light
  // default surface (white-on-white in dark Obsidian themes). Styling them through the theme — rather
  // than styles.css — lets CodeMirror's own specificity win over the baseTheme without `!important`,
  // and the generated theme class rides along on the tooltip container even when it is re-parented to
  // the window body, so these rules still reach it.
  ".cm-tooltip.cm-tooltip-hover, .cm-tooltip.cm-tooltip-lint": {
    backgroundColor: "var(--background-secondary)",
    color: "var(--text-normal)",
    border: "1px solid var(--background-modifier-border)",
    borderRadius: "var(--radius-s)",
  },
  ".cm-tooltip-hover .cm-tooltip-arrow:before, .cm-tooltip-hover .cm-tooltip-arrow:after": {
    borderTopColor: "var(--background-secondary)",
    borderBottomColor: "var(--background-secondary)",
  },
  // Drop the diagnostic's own padding so the message sits flush with the left severity strip.
  ".cm-tooltip-lint .cm-diagnostic": {
    padding: "0",
  },
});

// Indentation guides (007), shared by CodeView and both diff views. `obsidianEditorTheme` above never
// sets CM6's own `dark` facet — it reads Obsidian's `--*` CSS variables directly instead, the same way
// every other rule in this file does — so the extension's baseTheme `&dark` branch never engages and it
// would otherwise always render its hardcoded light-mode default regardless of the active Obsidian
// theme. Point both branches at the same Obsidian border variable (already used above for tooltip
// borders) so the guide reads as subtle on any theme (FR-005/SC-004). `highlightActiveBlock: false`:
// the spec's v1 explicitly excludes the "active indentation block" accent some editors add.
export const indentGuides = indentationMarkers({
  highlightActiveBlock: false,
  colors: {
    light: "var(--background-modifier-border)",
    dark: "var(--background-modifier-border)",
  },
});

// File extensions routed to CodeView (markdown stays with Obsidian).
export const CODE_VIEW_EXTENSIONS = [
  "js", "mjs", "cjs", "jsx", "ts", "tsx", "py", "pyw", "pyi", "rs",
  "json", "jsonc", "json5", "html", "htm", "xhtml", "css", "scss", "sass", "less",
  "c", "h", "cpp", "cc", "cxx", "hpp", "hh", "hxx", "go", "java", "kt", "kts",
  "scala", "sc", "cs", "dart", "m", "mm", "php", "sql", "xml", "xsd", "xsl", "plist",
  "yaml", "yml", "vue", "liquid", "wat", "wast", "sh", "bash", "zsh", "ksh",
  "rb", "gemspec", "lua", "pl", "pm", "toml", "ini", "conf", "cfg", "properties",
  "swift", "r", "jl", "hs", "clj", "cljs", "cljc", "edn", "diff", "patch",
  // tree-sitter grammars / formatters exist for these; route them so highlighting + Format work.
  "zig", "ex", "exs", "rake", "ru", "svelte", "astro", "erb", "ejs", "etlua",
  // templating: blade reaches CodeView via its ".php" extension (already registered above).
  "twig", "hbs", "handlebars", "pug", "jade", "haml", "slim",
  "feature", "j2", "jinja", "jinja2",
];
