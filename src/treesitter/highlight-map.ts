// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Maps tree-sitter highlight capture names to CSS classes. Capture names are dotted and
// hierarchical ("keyword.control", "string.special", "function.method"); we resolve by the most
// general segment. Classes are styled in styles.css against Obsidian's --code-* theme variables,
// so tree-sitter highlighting matches the active theme exactly like the Lezer path does.
const BY_PREFIX: Record<string, string> = {
  keyword: "keyword",
  string: "string",
  character: "string",
  escape: "string",
  number: "value",
  constant: "value",
  boolean: "value",
  float: "value",
  comment: "comment",
  function: "function",
  method: "function",
  label: "function",
  type: "type",
  constructor: "type",
  tag: "type",
  namespace: "type",
  module: "type",
  property: "property",
  attribute: "property",
  field: "property",
  operator: "operator",
  punctuation: "punctuation",
  variable: "variable",
  parameter: "variable",
};

// Returns a CSS class (e.g. "cm-ts-keyword") or null when the capture has no theme mapping.
export function captureClass(name: string): string | null {
  const kind = BY_PREFIX[name.split(".")[0]];
  return kind ? `cm-ts-${kind}` : null;
}
