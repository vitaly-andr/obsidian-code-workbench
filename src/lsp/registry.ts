// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Language → known language-server candidates (contracts/registry-entry.md). A static data table:
// adding or retargeting a language is an edit here, not code. The discovery layer (discovery.ts)
// reads it; only server names listed here (or a user-configured custom server, FR-025) are ever
// auto-launched (FR-023) — a command named by a project file is never run.
//
// `language` MUST be a canonical grammar id from src/treesitter/registry.ts, so the editor already
// highlights it. Template/markup-only ids (erb, ejs, slim, haml, liquid, twig, blade, pug, gherkin,
// jinja2, ini, …) have NO entry by design: they get intelligence through their embedded host
// language, not a server of their own.
//
// A note on two interpreter-hosted servers: R and Julia ship no standalone LSP binary — they run
// inside their interpreter (`R`/`julia`) loading a language-server package. The resolvable `bin` is
// therefore the interpreter, with args that start the server, and the install hint names the package
// the user must add. This is still a registry-known invocation, so FR-023 holds.

export interface ServerSpec {
  // Server identifier, e.g. "ruby-lsp".
  id: string;
  // Executable to resolve on the resolved PATH, e.g. "ruby-lsp" (or an interpreter, see header).
  bin: string;
  // Launch args (default []).
  args?: string[];
  // How to launch when the server is project-local (e.g. via `bundle exec`). Project-local installs
  // exposed as a plain executable (node_modules/.bin/…) are found by discovery without a wrapper.
  projectLocal?: {
    wrapper: string; // e.g. "bundle"
    args: string[]; // e.g. ["exec"]
    marker: string; // file that activates the wrapper, e.g. "Gemfile"
  };
  // Workspace-root markers, nearest-up wins (FR-027). ".git" is the universal fallback before the
  // vault root.
  rootMarkers: string[];
}

export interface RegistryEntry {
  // Canonical grammar id (matches src/treesitter/registry.ts).
  language: string;
  // Ordered by preference (FR-009); first resolvable wins.
  candidates: ServerSpec[];
  // Shown when nothing is found (FR-008); text only, never install logic.
  installHint: string;
}

// Common root markers shared by several languages.
const GIT = ".git";

function entry(
  language: string,
  installHint: string,
  candidates: ServerSpec[],
): RegistryEntry {
  return { language, candidates, installHint };
}

// Project-local Ruby launch via Bundler (the validated path).
const BUNDLE: ServerSpec["projectLocal"] = { wrapper: "bundle", args: ["exec"], marker: "Gemfile" };

// The TypeScript/JavaScript family all use one server. Project-local resolution finds
// node_modules/.bin/typescript-language-server without a wrapper.
const TS_CANDIDATES: ServerSpec[] = [
  {
    id: "typescript-language-server",
    bin: "typescript-language-server",
    args: ["--stdio"],
    rootMarkers: ["tsconfig.json", "jsconfig.json", "package.json", GIT],
  },
];
const TS_HINT =
  "No TypeScript/JavaScript language server found. Install one: `npm i -g typescript-language-server typescript`.";

export const REGISTRY: RegistryEntry[] = [
  // — Ruby (first end-to-end validation target) —
  entry("ruby", "No Ruby language server found. Install one: `gem install ruby-lsp`.", [
    { id: "ruby-lsp", bin: "ruby-lsp", args: [], projectLocal: BUNDLE, rootMarkers: ["Gemfile", GIT] },
    { id: "solargraph", bin: "solargraph", args: ["stdio"], projectLocal: BUNDLE, rootMarkers: ["Gemfile", GIT] },
  ]),

  // — TypeScript / JavaScript / TSX —
  entry("typescript", TS_HINT, TS_CANDIDATES),
  entry("javascript", TS_HINT, TS_CANDIDATES),
  entry("tsx", TS_HINT, TS_CANDIDATES),

  // — Python —
  entry("python", "No Python language server found. Install one: `pipx install pyright` (or `python-lsp-server`).", [
    { id: "pyright", bin: "pyright-langserver", args: ["--stdio"], rootMarkers: ["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", GIT] },
    { id: "pylsp", bin: "pylsp", args: [], rootMarkers: ["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", GIT] },
    { id: "jedi", bin: "jedi-language-server", args: [], rootMarkers: ["pyproject.toml", "setup.py", GIT] },
  ]),

  // — Rust —
  entry("rust", "No Rust language server found. Install it: `rustup component add rust-analyzer`.", [
    { id: "rust-analyzer", bin: "rust-analyzer", args: [], rootMarkers: ["Cargo.toml", GIT] },
  ]),

  // — Go —
  entry("go", "No Go language server found. Install it: `go install golang.org/x/tools/gopls@latest`.", [
    { id: "gopls", bin: "gopls", args: [], rootMarkers: ["go.work", "go.mod", GIT] },
  ]),

  // — C / C++ / Objective-C (clangd handles all three) —
  entry("c", "No C/C++ language server found. Install clangd (LLVM): e.g. `brew install llvm` or your distro's `clangd`.", [
    { id: "clangd", bin: "clangd", args: [], rootMarkers: ["compile_commands.json", "compile_flags.txt", "CMakeLists.txt", GIT] },
    { id: "ccls", bin: "ccls", args: [], rootMarkers: ["compile_commands.json", ".ccls", GIT] },
  ]),
  entry("cpp", "No C/C++ language server found. Install clangd (LLVM): e.g. `brew install llvm` or your distro's `clangd`.", [
    { id: "clangd", bin: "clangd", args: [], rootMarkers: ["compile_commands.json", "compile_flags.txt", "CMakeLists.txt", GIT] },
    { id: "ccls", bin: "ccls", args: [], rootMarkers: ["compile_commands.json", ".ccls", GIT] },
  ]),
  entry("objc", "No Objective-C language server found. Install clangd (LLVM).", [
    { id: "clangd", bin: "clangd", args: [], rootMarkers: ["compile_commands.json", "compile_flags.txt", GIT] },
  ]),

  // — C# —
  entry("csharp", "No C# language server found. Install one: `dotnet tool install --global csharp-ls`.", [
    { id: "csharp-ls", bin: "csharp-ls", args: [], rootMarkers: ["global.json", GIT] },
    { id: "omnisharp", bin: "omnisharp", args: ["-lsp"], rootMarkers: ["global.json", GIT] },
  ]),

  // — Java —
  entry("java", "No Java language server found. Install Eclipse JDT Language Server (`jdtls`).", [
    { id: "jdtls", bin: "jdtls", args: [], rootMarkers: ["pom.xml", "build.gradle", "settings.gradle", GIT] },
  ]),

  // — PHP —
  entry("php", "No PHP language server found. Install one: `npm i -g intelephense`.", [
    { id: "intelephense", bin: "intelephense", args: ["--stdio"], rootMarkers: ["composer.json", GIT] },
    { id: "phpactor", bin: "phpactor", args: ["language-server"], rootMarkers: ["composer.json", GIT] },
  ]),

  // — Scala —
  entry("scala", "No Scala language server found. Install Metals (`coursier install metals`).", [
    { id: "metals", bin: "metals", args: [], rootMarkers: ["build.sbt", "build.sc", GIT] },
  ]),

  // — Haskell —
  entry("haskell", "No Haskell language server found. Install HLS via `ghcup install hls`.", [
    { id: "hls", bin: "haskell-language-server-wrapper", args: ["--lsp"], rootMarkers: ["stack.yaml", "cabal.project", GIT] },
  ]),

  // — Elixir —
  entry("elixir", "No Elixir language server found. Install ElixirLS (or `next-ls`).", [
    { id: "elixir-ls", bin: "elixir-ls", args: [], rootMarkers: ["mix.exs", GIT] },
    { id: "next-ls", bin: "next-ls", args: ["--stdio"], rootMarkers: ["mix.exs", GIT] },
  ]),

  // — Zig —
  entry("zig", "No Zig language server found. Install `zls`.", [
    { id: "zls", bin: "zls", args: [], rootMarkers: ["build.zig", GIT] },
  ]),

  // — Lua —
  entry("lua", "No Lua language server found. Install `lua-language-server`.", [
    { id: "lua-language-server", bin: "lua-language-server", args: [], rootMarkers: [".luarc.json", ".luarc.jsonc", GIT] },
  ]),

  // — Bash —
  entry("bash", "No Bash language server found. Install it: `npm i -g bash-language-server`.", [
    { id: "bash-language-server", bin: "bash-language-server", args: ["start"], rootMarkers: [GIT] },
  ]),

  // — Swift —
  entry("swift", "No Swift language server found. Install the Swift toolchain (ships `sourcekit-lsp`).", [
    { id: "sourcekit-lsp", bin: "sourcekit-lsp", args: [], rootMarkers: ["Package.swift", GIT] },
  ]),

  // — R (interpreter-hosted; needs the `languageserver` package) —
  entry("r", "No R language server found. In R: `install.packages(\"languageserver\")`.", [
    { id: "r-languageserver", bin: "R", args: ["--slave", "-e", "languageserver::run()"], rootMarkers: ["DESCRIPTION", GIT] },
  ]),

  // — Perl —
  entry("perl", "No Perl language server found. Install one: `cpanm PLS` (or `perlnavigator`).", [
    { id: "pls", bin: "pls", args: [], rootMarkers: ["cpanfile", "Makefile.PL", GIT] },
    { id: "perlnavigator", bin: "perlnavigator", args: ["--stdio"], rootMarkers: ["cpanfile", GIT] },
  ]),

  // — Clojure —
  entry("clojure", "No Clojure language server found. Install `clojure-lsp`.", [
    { id: "clojure-lsp", bin: "clojure-lsp", args: [], rootMarkers: ["deps.edn", "project.clj", GIT] },
  ]),

  // — Dart —
  entry("dart", "No Dart SDK found (ships the analysis server). Install Dart/Flutter.", [
    { id: "dart", bin: "dart", args: ["language-server", "--protocol=lsp"], rootMarkers: ["pubspec.yaml", GIT] },
  ]),

  // — Julia (interpreter-hosted; needs the `LanguageServer` package) —
  entry("julia", "No Julia language server found. In Julia: `import Pkg; Pkg.add(\"LanguageServer\")`.", [
    { id: "julia-languageserver", bin: "julia", args: ["--startup-file=no", "-e", "using LanguageServer; runserver()"], rootMarkers: ["Project.toml", "JuliaProject.toml", GIT] },
  ]),

  // — Kotlin —
  entry("kotlin", "No Kotlin language server found. Install `kotlin-language-server`.", [
    { id: "kotlin-language-server", bin: "kotlin-language-server", args: [], rootMarkers: ["build.gradle.kts", "settings.gradle.kts", GIT] },
  ]),

  // — Vue —
  entry("vue", "No Vue language server found. Install it: `npm i -g @vue/language-server`.", [
    { id: "vue-language-server", bin: "vue-language-server", args: ["--stdio"], rootMarkers: ["package.json", GIT] },
  ]),

  // — Svelte —
  entry("svelte", "No Svelte language server found. Install it: `npm i -g svelte-language-server`.", [
    { id: "svelteserver", bin: "svelteserver", args: ["--stdio"], rootMarkers: ["svelte.config.js", "package.json", GIT] },
  ]),

  // — HTML / CSS / JSON (vscode-langservers-extracted) —
  entry("html", "No HTML language server found. Install it: `npm i -g vscode-langservers-extracted`.", [
    { id: "vscode-html", bin: "vscode-html-language-server", args: ["--stdio"], rootMarkers: ["package.json", GIT] },
  ]),
  entry("css", "No CSS language server found. Install it: `npm i -g vscode-langservers-extracted`.", [
    { id: "vscode-css", bin: "vscode-css-language-server", args: ["--stdio"], rootMarkers: ["package.json", GIT] },
  ]),
  entry("json", "No JSON language server found. Install it: `npm i -g vscode-langservers-extracted`.", [
    { id: "vscode-json", bin: "vscode-json-language-server", args: ["--stdio"], rootMarkers: ["package.json", GIT] },
  ]),

  // — YAML —
  entry("yaml", "No YAML language server found. Install it: `npm i -g yaml-language-server`.", [
    { id: "yaml-language-server", bin: "yaml-language-server", args: ["--stdio"], rootMarkers: [GIT] },
  ]),

  // — TOML —
  entry("toml", "No TOML language server found. Install Taplo (`cargo install taplo-cli`).", [
    { id: "taplo", bin: "taplo", args: ["lsp", "stdio"], rootMarkers: [GIT] },
  ]),

  // — XML —
  entry("xml", "No XML language server found. Install LemMinX (`lemminx`).", [
    { id: "lemminx", bin: "lemminx", args: [], rootMarkers: [GIT] },
  ]),

  // — SQL —
  entry("sql", "No SQL language server found. Install it: `npm i -g sql-language-server`.", [
    { id: "sql-language-server", bin: "sql-language-server", args: ["up", "--method", "stdio"], rootMarkers: [GIT] },
  ]),

  // — Astro —
  entry("astro", "No Astro language server found. Install it: `npm i -g @astrojs/language-server`.", [
    { id: "astro-ls", bin: "astro-ls", args: ["--stdio"], rootMarkers: ["astro.config.mjs", "astro.config.ts", "package.json", GIT] },
  ]),
];

export function registryFor(language: string): RegistryEntry | undefined {
  return REGISTRY.find((e) => e.language === language);
}
