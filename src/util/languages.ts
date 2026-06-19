// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Maps a file extension to a language identifier (VS Code style). Unknown -> "plaintext".
// Drives getOpenEditors.languageId. (Syntax highlighting itself lives in views/cm-theme.ts.)
const EXT_TO_LANGUAGE: Record<string, string> = {
  md: "markdown", markdown: "markdown",
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascriptreact",
  ts: "typescript", tsx: "typescriptreact",
  py: "python", pyw: "python", pyi: "python",
  rs: "rust",
  json: "json", jsonc: "json", json5: "json",
  html: "html", htm: "html", xhtml: "html",
  css: "css", scss: "scss", sass: "sass", less: "less",
  c: "c", h: "c",
  cpp: "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp", hh: "cpp", hxx: "cpp",
  go: "go", java: "java", kt: "kotlin", kts: "kotlin", scala: "scala", sc: "scala",
  cs: "csharp", dart: "dart", m: "objective-c", mm: "objective-cpp",
  php: "php", sql: "sql",
  xml: "xml", xsd: "xml", xsl: "xml", svg: "xml", plist: "xml",
  yaml: "yaml", yml: "yaml", vue: "vue", liquid: "liquid", wat: "wat", wast: "wat",
  sh: "shellscript", bash: "shellscript", zsh: "shellscript", ksh: "shellscript",
  rb: "ruby", gemspec: "ruby", lua: "lua", pl: "perl", pm: "perl",
  toml: "toml", ini: "ini", conf: "ini", cfg: "ini", properties: "ini",
  swift: "swift", r: "r", jl: "julia", hs: "haskell",
  clj: "clojure", cljs: "clojure", cljc: "clojure", edn: "clojure",
  diff: "diff", patch: "diff", txt: "plaintext",
};

export function extensionOf(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function languageIdForPath(path: string): string {
  return EXT_TO_LANGUAGE[extensionOf(path)] ?? "plaintext";
}

// Routing key for syntax highlighting (Lezer fallback + tree-sitter grammar lookup). Usually the
// file extension, but compound extensions need the full name: ".blade.php" must resolve to "blade",
// not "php" (extensionOf only sees the last segment).
export function grammarKeyForPath(path: string): string {
  if (/\.blade\.php$/i.test(path)) return "blade";
  return extensionOf(path);
}

export function isMarkdown(path: string): boolean {
  const ext = extensionOf(path);
  return ext === "md" || ext === "markdown";
}
