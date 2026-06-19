// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Per-language tree-sitter sources. Versions are PINNED so the grammar's ABI matches the
// web-tree-sitter runtime and the highlights query matches the grammar. Two source kinds:
//   - npm  : the grammar's own package ships a current-ABI .wasm + queries (jsDelivr). 26 langs.
//   - self : no modern npm wasm exists; we self-build (tree-sitter 0.26 CLI + wasi-sdk) and host
//            the .wasm on the plugin's GitHub release. Queries come from the grammar repo.
// Markdown is intentionally absent — Obsidian renders it natively.
// Exact paths/versions captured by tests/runtime/grammar-survey.cjs (2026-06-17).

export interface GrammarSource {
  // URL of the grammar .wasm (pinned).
  wasmUrl: string;
  // URL of highlights.scm, or null when the grammar ships none — then highlighting falls back to
  // the Lezer/legacy stack while tree-sitter still provides diagnostics.
  highlightsUrl: string | null;
  // For grammars that extend another (cpp←c, ts/tsx←js): the base grammar's highlights.scm, which
  // is prepended to this one. The npm packages ship only the language-specific delta, so without
  // the base most tokens get no capture at all.
  baseHighlightsUrl?: string | null;
  // For component/template grammars: the injections.scm that marks embedded-language regions
  // (astro frontmatter = typescript, html <style> = css, svelte <script> = javascript). When set,
  // the loader compiles it and pre-loads the injected grammars so the highlighter can colour them.
  injectionsUrl?: string | null;
  // Inline injection query, overriding injectionsUrl. Used when the upstream injections.scm can't be
  // used as-is: svelte's relies on `; inherits: html_tags` (which we don't process) plus a catch-all
  // that mis-tags <style> as javascript; astro's has no plain <style>→css rule; embedded-template
  // ships no default injections.scm (only per-host variants). Otherwise embedded code stays uncoloured.
  injectionsScm?: string | null;
  // A stable key for the on-disk cache filename.
  id: string;
}

const JSDELIVR = "https://cdn.jsdelivr.net/npm";
// Self-built grammars are published as release assets on the plugin repo (tag `grammars-v1`).
const SELF_HOST = "https://github.com/vitaly-andr/obsidian-code-workbench/releases/download/grammars-v1";

function npm(id: string, pkg: string, ver: string, wasm: string, hl: string | null, baseHl?: string): GrammarSource {
  return {
    id,
    wasmUrl: `${JSDELIVR}/${pkg}@${ver}${wasm}`,
    highlightsUrl: hl ? `${JSDELIVR}/${pkg}@${ver}${hl}` : null,
    baseHighlightsUrl: baseHl ?? null,
  };
}

// Self-built grammars host both the .wasm and (when present) its version-matched highlights.scm on
// the release, so the grammar and query are always the exact pair we built and verified together.
function self(id: string, hasHighlights: boolean): GrammarSource {
  return {
    id,
    wasmUrl: `${SELF_HOST}/tree-sitter-${id}.wasm`,
    highlightsUrl: hasHighlights ? `${SELF_HOST}/tree-sitter-${id}.highlights.scm` : null,
  };
}

const HL = "/queries/highlights.scm";

// Corrected, inline injection queries (see GrammarSource.injectionsScm).
// svelte upstream = "; inherits: html_tags" + a catch-all ((raw_text)→javascript) that swallows the
// <style> body, and ships no <style>→css rule; we make script/style explicit and add <style>→css.
const SVELTE_INJECTIONS = `
((script_element (raw_text) @injection.content)
  (#set! injection.language "javascript"))
((script_element
  (start_tag (attribute (attribute_name) @_a (quoted_attribute_value (attribute_value) @_l)))
  (raw_text) @injection.content)
  (#eq? @_a "lang") (#any-of? @_l "ts" "typescript")
  (#set! injection.language "typescript"))
((style_element (raw_text) @injection.content)
  (#set! injection.language "css"))
((style_element
  (start_tag (attribute (attribute_name) @_a2 (quoted_attribute_value (attribute_value) @_l2)))
  (raw_text) @injection.content)
  (#eq? @_a2 "lang") (#any-of? @_l2 "scss" "postcss" "less")
  (#set! injection.language "scss"))
`;

// astro upstream injects only <style lang="scss">; add the plain <style>→css rule (rest unchanged).
const ASTRO_INJECTIONS = `
(frontmatter (frontmatter_js_block) @injection.content
  (#set! injection.language "typescript"))
(attribute_interpolation (attribute_js_expr) @injection.content
  (#set! injection.language "typescript"))
(html_interpolation (permissible_text) @injection.content
  (#set! injection.language "typescript"))
(script_element (raw_text) @injection.content
  (#set! injection.language "typescript"))
(style_element (raw_text) @injection.content
  (#set! injection.language "css"))
(style_element
  (start_tag (attribute (attribute_name) @_lang_attr (quoted_attribute_value (attribute_value) @_lang_value)))
  (raw_text) @injection.content
  (#eq? @_lang_attr "lang") (#eq? @_lang_value "scss")
  (#set! injection.language "scss"))
`;

// embedded-template (.erb) ships no default injections.scm — only injections-erb/ejs/etlua variants.
// The erb variant: template text → html, <% %> code → ruby. (injection.combined is upstream's hint to
// parse the fragments as one unit; our highlighter parses each region standalone, which still colours
// each fragment correctly.)
const ERB_INJECTIONS = `
((content) @injection.content
  (#set! injection.language "html"))
((code) @injection.content
  (#set! injection.language "ruby"))
`;

// Same embedded_template grammar as ERB; only the <% %> host language differs (EJS=js, ETLua=lua).
const EJS_INJECTIONS = `
((content) @injection.content
  (#set! injection.language "html"))
((code) @injection.content
  (#set! injection.language "javascript"))
`;
const ETLUA_INJECTIONS = `
((content) @injection.content
  (#set! injection.language "html"))
((code) @injection.content
  (#set! injection.language "lua"))
`;

// Self-built template grammars (hosted on grammars-v1). Injection queries are inlined here, cleaned to
// our engine's convention (@injection.content + #set! injection.language "<lang>"):
//   twig    – markup text → html (twig expressions are coloured by twig's own highlights)
//   glimmer – <style>/<script> tags → css/javascript (handlebars itself is self-highlighted)
//   blade   – @php / {{ }} php_only content → the php_only grammar (bare PHP, no <?php tags)
//   haml    – ruby code/attributes → ruby, plus :filter blocks via dynamic @injection.language
//   slim    – ruby lines/attrs → ruby
const TWIG_INJECTIONS = `
((content) @injection.content
  (#set! injection.language "html"))
`;
const GLIMMER_INJECTIONS = `
((style_element (raw_text) @injection.content)
  (#set! injection.language "css"))
((script_element (raw_text) @injection.content)
  (#set! injection.language "javascript"))
`;
const BLADE_INJECTIONS = `
((php_only) @injection.content
  (#set! injection.language "php_only"))
((parameter) @injection.content
  (#set! injection.language "php_only"))
`;
const HAML_INJECTIONS = `
((ruby_code) @injection.content
  (#set! injection.language "ruby"))
((ruby_attributes) @injection.content
  (#set! injection.language "ruby"))
(filter (filter_name) @injection.language (filter_body) @injection.content)
`;
const SLIM_INJECTIONS = `
((ruby) @injection.content
  (#set! injection.language "ruby"))
((attr_value_ruby) @injection.content
  (#set! injection.language "ruby"))
((attr_splat) @injection.content
  (#set! injection.language "ruby"))
`;

// Canonical grammar id -> source.
const SOURCES: Record<string, GrammarSource> = {
  javascript: npm("javascript", "tree-sitter-javascript", "0.25.0", "/tree-sitter-javascript.wasm", HL),
  // ts/tsx ship only their delta; prepend javascript's highlights for the base tokens.
  typescript: npm("typescript", "tree-sitter-typescript", "0.23.2", "/tree-sitter-typescript.wasm", HL, `${JSDELIVR}/tree-sitter-javascript@0.25.0${HL}`),
  tsx: npm("tsx", "tree-sitter-typescript", "0.23.2", "/tree-sitter-tsx.wasm", HL, `${JSDELIVR}/tree-sitter-javascript@0.25.0${HL}`),
  python: npm("python", "tree-sitter-python", "0.25.0", "/tree-sitter-python.wasm", HL),
  rust: npm("rust", "tree-sitter-rust", "0.24.0", "/tree-sitter-rust.wasm", HL),
  json: npm("json", "tree-sitter-json", "0.24.8", "/tree-sitter-json.wasm", HL),
  html: {
    ...npm("html", "tree-sitter-html", "0.23.2", "/tree-sitter-html.wasm", HL),
    injectionsUrl: `${JSDELIVR}/tree-sitter-html@0.23.2/queries/injections.scm`,
  },
  css: npm("css", "tree-sitter-css", "0.25.0", "/tree-sitter-css.wasm", HL),
  c: npm("c", "tree-sitter-c", "0.24.1", "/tree-sitter-c.wasm", HL),
  // cpp ships only its delta; prepend c's highlights for the base tokens.
  cpp: npm("cpp", "tree-sitter-cpp", "0.23.4", "/tree-sitter-cpp.wasm", HL, `${JSDELIVR}/tree-sitter-c@0.24.1${HL}`),
  go: npm("go", "tree-sitter-go", "0.25.0", "/tree-sitter-go.wasm", HL),
  java: npm("java", "tree-sitter-java", "0.23.5", "/tree-sitter-java.wasm", HL),
  bash: npm("bash", "tree-sitter-bash", "0.25.1", "/tree-sitter-bash.wasm", HL),
  ruby: npm("ruby", "tree-sitter-ruby", "0.23.1", "/tree-sitter-ruby.wasm", HL),
  php: npm("php", "tree-sitter-php", "0.24.2", "/tree-sitter-php.wasm", HL),
  csharp: npm("csharp", "tree-sitter-c-sharp", "0.23.5", "/tree-sitter-c_sharp.wasm", HL),
  scala: npm("scala", "tree-sitter-scala", "0.24.0", "/tree-sitter-scala.wasm", HL),
  haskell: npm("haskell", "tree-sitter-haskell", "0.23.1", "/tree-sitter-haskell.wasm", HL),
  julia: npm("julia", "tree-sitter-julia", "0.23.1", "/tree-sitter-julia.wasm", HL),
  elixir: npm("elixir", "tree-sitter-elixir", "0.3.5", "/tree-sitter-elixir.wasm", HL),
  zig: npm("zig", "@tree-sitter-grammars/tree-sitter-zig", "1.1.2", "/tree-sitter-zig.wasm", HL),
  lua: npm("lua", "@tree-sitter-grammars/tree-sitter-lua", "0.4.1", "/tree-sitter-lua.wasm", HL),
  toml: npm("toml", "@tree-sitter-grammars/tree-sitter-toml", "0.7.0", "/tree-sitter-toml.wasm", HL),
  yaml: npm("yaml", "@tree-sitter-grammars/tree-sitter-yaml", "0.7.1", "/tree-sitter-yaml.wasm", HL),
  svelte: {
    ...npm("svelte", "@tree-sitter-grammars/tree-sitter-svelte", "1.0.2", "/tree-sitter-svelte.wasm", HL),
    injectionsScm: SVELTE_INJECTIONS,
  },
  // ERB/EJS/ETLua share the embedded_template grammar; it colours the <% %> delimiters while the
  // injections add the host language (ruby/javascript/lua) + html for the surrounding markup.
  erb: {
    ...npm("erb", "tree-sitter-embedded-template", "0.25.0", "/tree-sitter-embedded_template.wasm", HL),
    injectionsScm: ERB_INJECTIONS,
  },
  ejs: {
    ...npm("ejs", "tree-sitter-embedded-template", "0.25.0", "/tree-sitter-embedded_template.wasm", HL),
    injectionsScm: EJS_INJECTIONS,
  },
  etlua: {
    ...npm("etlua", "tree-sitter-embedded-template", "0.25.0", "/tree-sitter-embedded_template.wasm", HL),
    injectionsScm: ETLUA_INJECTIONS,
  },
  objc: npm("objc", "tree-sitter-objc", "3.0.2", "/tree-sitter-objc.wasm", HL),

  // Self-built (no modern npm wasm), verified to load in the 0.26.9 runtime. vue's upstream query
  // uses nvim-only predicates that web-tree-sitter rejects, so vue keeps the Lezer colours and gains
  // only tree-sitter diagnostics.
  sql: self("sql", true),
  swift: self("swift", true),
  xml: self("xml", true),
  vue: self("vue", false),
  r: self("r", true),
  // Self-built from github sources (no usable npm wasm / no highlights) and hosted on grammars-v1;
  // each verified to load + compile its highlights in the 0.26.9 runtime.
  astro: { ...self("astro", true), injectionsScm: ASTRO_INJECTIONS },
  dart: self("dart", true),
  clojure: self("clojure", true),
  perl: self("perl", true),
  ini: self("ini", true),
  liquid: self("liquid", true),
  kotlin: self("kotlin", true),

  // Self-built templating grammars (grammars-v1). Twig's upstream highlights were a stub, so we
  // authored one; the others reuse their repo's highlights. Injections inlined above.
  twig: { ...self("twig", true), injectionsScm: TWIG_INJECTIONS },
  glimmer: { ...self("glimmer", true), injectionsScm: GLIMMER_INJECTIONS },
  blade: { ...self("blade", true), injectionsScm: BLADE_INJECTIONS },
  pug: self("pug", true),
  haml: { ...self("haml", true), injectionsScm: HAML_INJECTIONS },
  slim: { ...self("slim", true), injectionsScm: SLIM_INJECTIONS },
  // Gherkin (.feature) is a standalone BDD DSL — highlight-only, no embedded language.
  gherkin: self("gherkin", true),
  // Jinja2 (.j2 / ansible) colours the {{ }} / {% %} markers; the surrounding text host (html, yaml,
  // conf…) is ambiguous per-file, so it isn't injected — the template logic still stands out.
  jinja2: self("jinja2", true),
  // php_only = the tag-less PHP grammar variant; Blade's {{ }} / @php content is bare PHP. From npm
  // (no upload needed); reuses tree-sitter-php's highlights, which compile against it.
  php_only: npm("php_only", "tree-sitter-php", "0.24.2", "/tree-sitter-php_only.wasm", HL),
};

// File extension -> canonical grammar id. Mirrors the routing in views/cm-theme.ts; extensions
// with no tree-sitter grammar return null and keep the Lezer/legacy highlighter.
const EXT_TO_ID: Record<string, string> = {
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript",
  ts: "typescript", tsx: "tsx",
  py: "python", pyw: "python", pyi: "python",
  rs: "rust",
  json: "json", jsonc: "json", json5: "json",
  html: "html", htm: "html", xhtml: "html",
  css: "css",
  c: "c", h: "c",
  cpp: "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp", hh: "cpp", hxx: "cpp",
  go: "go", java: "java",
  kt: "kotlin", kts: "kotlin",
  scala: "scala", sc: "scala",
  cs: "csharp", m: "objc", mm: "objc",
  php: "php", sql: "sql",
  xml: "xml", xsd: "xml", xsl: "xml", svg: "xml", plist: "xml",
  yaml: "yaml", yml: "yaml", vue: "vue", svelte: "svelte",
  erb: "erb", ejs: "ejs", etlua: "etlua",
  twig: "twig", hbs: "glimmer", handlebars: "glimmer",
  pug: "pug", jade: "pug", haml: "haml", slim: "slim",
  // blade is reached via grammarForPath (".blade.php" compound extension), not a bare extension.
  blade: "blade",
  feature: "gherkin", j2: "jinja2", jinja: "jinja2", jinja2: "jinja2",
  sh: "bash", bash: "bash", zsh: "bash", ksh: "bash",
  rb: "ruby", gemspec: "ruby", rake: "ruby", ru: "ruby", lua: "lua", toml: "toml",
  swift: "swift", r: "r", jl: "julia", hs: "haskell",
  ex: "elixir", exs: "elixir", zig: "zig",
  astro: "astro", dart: "dart", liquid: "liquid",
  clj: "clojure", cljs: "clojure", cljc: "clojure", edn: "clojure",
  pl: "perl", pm: "perl",
  ini: "ini", conf: "ini", cfg: "ini", properties: "ini",
};

export function grammarForExtension(ext: string): GrammarSource | null {
  const id = EXT_TO_ID[ext];
  return id ? SOURCES[id] : null;
}

// Look up a grammar by its canonical id — used to pre-load grammars referenced by injection queries.
export function grammarById(id: string): GrammarSource | null {
  return SOURCES[id] ?? null;
}

// Map an injection-query language name to a grammar id we have. scss/less reuse the css grammar.
export function normalizeLang(name: string): string {
  switch (name) {
    case "ts": return "typescript";
    case "js": return "javascript";
    case "scss": case "less": case "postcss": return "css";
    default: return name;
  }
}
