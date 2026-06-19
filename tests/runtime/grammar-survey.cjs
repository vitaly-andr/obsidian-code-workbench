// Surveys which languages have a MODERN per-grammar npm package shipping both a current-ABI
// .wasm and a highlights query. Output becomes the grammar registry; gaps are self-build targets.
const CANDIDATES = {
  javascript: ["tree-sitter-javascript"],
  typescript: ["tree-sitter-typescript"],
  python: ["tree-sitter-python"],
  rust: ["tree-sitter-rust"],
  json: ["tree-sitter-json"],
  html: ["tree-sitter-html"],
  css: ["tree-sitter-css"],
  c: ["tree-sitter-c"],
  cpp: ["tree-sitter-cpp"],
  go: ["tree-sitter-go"],
  java: ["tree-sitter-java"],
  bash: ["tree-sitter-bash"],
  ruby: ["tree-sitter-ruby"],
  php: ["tree-sitter-php"],
  csharp: ["tree-sitter-c-sharp"],
  scala: ["tree-sitter-scala"],
  swift: ["tree-sitter-swift"],
  haskell: ["tree-sitter-haskell"],
  julia: ["tree-sitter-julia"],
  ocaml: ["tree-sitter-ocaml"],
  elixir: ["tree-sitter-elixir"],
  elm: ["tree-sitter-elm", "@elm-tooling/tree-sitter-elm"],
  zig: ["tree-sitter-zig", "@tree-sitter-grammars/tree-sitter-zig"],
  lua: ["@tree-sitter-grammars/tree-sitter-lua", "tree-sitter-lua"],
  toml: ["@tree-sitter-grammars/tree-sitter-toml", "tree-sitter-toml"],
  yaml: ["@tree-sitter-grammars/tree-sitter-yaml", "tree-sitter-yaml"],
  kotlin: ["@tree-sitter-grammars/tree-sitter-kotlin", "tree-sitter-kotlin"],
  markdown: ["@tree-sitter-grammars/tree-sitter-markdown", "tree-sitter-markdown"],
  xml: ["@tree-sitter-grammars/tree-sitter-xml", "tree-sitter-xml"],
  vue: ["@tree-sitter-grammars/tree-sitter-vue", "tree-sitter-vue"],
  sql: ["@derekstride/tree-sitter-sql", "tree-sitter-sql"],
  r: ["tree-sitter-r"],
  perl: ["tree-sitter-perl"],
  clojure: ["tree-sitter-clojure"],
  dart: ["tree-sitter-dart"],
  objc: ["tree-sitter-objc"],
};

async function meta(pkg) {
  try {
    const r = await fetch(`https://data.jsdelivr.com/v1/packages/npm/${pkg}`);
    if (!r.ok) return null;
    const ver = (await r.json()).tags?.latest;
    if (!ver) return null;
    const f = await fetch(`https://data.jsdelivr.com/v1/packages/npm/${pkg}@${ver}?structure=flat`);
    if (!f.ok) return null;
    const files = (await f.json()).files.map((x) => x.name);
    const wasm = files.filter((n) => n.endsWith(".wasm"));
    const hl = files.filter((n) => n.endsWith("highlights.scm"));
    return { pkg, ver, wasm, hl };
  } catch {
    return null;
  }
}

if (!process.argv.includes("--json")) (async () => {
  const rows = [];
  for (const [lang, pkgs] of Object.entries(CANDIDATES)) {
    let hit = null;
    for (const p of pkgs) {
      const m = await meta(p);
      if (m && m.wasm.length) { hit = m; break; }
      if (m && !hit) hit = m; // remember even if no wasm, to show why
    }
    if (hit && hit.wasm.length) {
      rows.push({ lang, ok: true, pkg: `${hit.pkg}@${hit.ver}`, wasm: hit.wasm.length, hl: hit.hl.length > 0 });
    } else {
      rows.push({ lang, ok: false, pkg: hit ? `${hit.pkg}@${hit.ver}` : "(not found)", wasm: 0, hl: false });
    }
  }
  const ok = rows.filter((r) => r.ok);
  console.log(`COVERAGE: ${ok.length}/${rows.length} have modern wasm\n`);
  console.log("GAPS (self-build):", rows.filter((r) => !r.ok).map((r) => r.lang).join(", ") || "none");
})();

// When run as `node grammar-survey.cjs --json`, emit exact wasm + highlights paths per language.
async function dumpJson() {
  const out = {};
  for (const [lang, pkgs] of Object.entries(CANDIDATES)) {
    for (const p of pkgs) {
      const m = await meta(p);
      if (m && m.wasm.length) {
        out[lang] = { pkg: m.pkg, ver: m.ver, wasm: m.wasm, highlights: m.hl };
        break;
      }
    }
  }
  console.log(JSON.stringify(out, null, 2));
}
if (process.argv.includes("--json")) dumpJson();
