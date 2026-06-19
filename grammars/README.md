# Self-built tree-sitter grammars

The plugin loads tree-sitter grammars on demand. Most come straight from npm (see
`src/treesitter/registry.ts`). The grammars below have no usable npm WASM for the
web-tree-sitter 0.26.x ABI, so they are built from source and hosted as assets on
the `grammars-v1` GitHub release; the loader downloads each on first use and caches
it in the plugin folder.

This directory records how to reproduce those release assets. Highlight queries we
authored or modified are stored under `queries/`; upstream queries are referenced by
commit rather than vendored. Injection queries are not here — they are inlined in
`src/treesitter/registry.ts` (`*_INJECTIONS` constants).

## Build recipe

Needs the tree-sitter CLI (0.26.x). The first `build --wasm` downloads a WASI SDK
into `~/.cache/tree-sitter/` and reuses it afterwards — no Docker, no emscripten.

```sh
git clone --depth 1 <repo> g && cd g
git checkout <commit>                       # pin to the row below
[ -f src/parser.c ] || tree-sitter generate
tree-sitter build --wasm -o tree-sitter-<id>.wasm .
```

Then upload `tree-sitter-<id>.wasm` (and, when listed as "authored"/"patched" below,
`tree-sitter-<id>.highlights.scm`) to the `grammars-v1` release:

```sh
gh release upload grammars-v1 tree-sitter-<id>.wasm [tree-sitter-<id>.highlights.scm] --clobber
```

Verify a built grammar loads under the runtime before uploading: `Language.load` it
with `web-tree-sitter@0.26.x` and confirm `lang.abiVersion` is 14 or 15.

## Templating batch

| id | source repo | commit | highlights | notes |
|----|-------------|--------|-----------|-------|
| twig | github.com/kaermorchen/tree-sitter-twig | `dac11024e40536d05c958d920139c310cbe86625` | authored: `queries/twig.highlights.scm` | upstream shipped only a `(comment)` stub |
| glimmer | github.com/ember-tooling/tree-sitter-glimmer | `88af85568bde3b91acb5d4c352ed094d0c1f9d84` | upstream: `queries/glimmer/highlights.scm` | Handlebars; injects css/js into `<style>`/`<script>` |
| blade | github.com/EmranMR/tree-sitter-blade | `5dbdcb0ccbe91e64b038b41545d3acc26c74907a` | authored: `queries/blade.highlights.scm` | bare-PHP content injected to the `php_only` grammar |
| pug | github.com/zealot128/tree-sitter-pug | `13e9195370172c86a8b88184cc358b23b677cc46` | upstream: `queries/highlights.scm` | no injection |
| haml | github.com/vitallium/tree-sitter-haml | `3ea15266a86dc4d921e8a2c2213d1ca15661d7ba` | upstream: `queries/highlights.scm` | injection rewritten to our convention in registry.ts |
| slim | github.com/kolen/tree-sitter-slim | `d116919433c4d8935501df72405141c602e9bd25` | upstream: `queries/highlights.scm` | injects ruby |
| gherkin | github.com/binhtddev/tree-sitter-gherkin | `1a709aebeecbe81bd70dfd6ea784894844be1511` | upstream: `queries/gherkin/highlights.scm` | standalone DSL, no injection |
| jinja2 | github.com/lmderval/tree-sitter-jinja2 | `683c7d76f2727d6d467ff962053eb8a129369d94` | patched: `queries/jinja2.highlights.scm` | grammar patched to parse `{# #}` comments — see `patches/` |

The ERB/EJS/ETLua trio is not built here: it uses the npm `tree-sitter-embedded-template`
grammar directly (see registry.ts).

## Jinja2 patch

`lmderval/tree-sitter-jinja2` reserves `{#` in its `text` token but never defines a
comment node, so `{# … #}` failed to parse. `patches/tree-sitter-jinja2-comment.patch`
adds a `comment` rule and lists it in `body`. Apply it before `tree-sitter generate`:

```sh
git apply path/to/tree-sitter-jinja2-comment.patch
tree-sitter generate && tree-sitter build --wasm -o tree-sitter-jinja2.wasm .
```

The stored `queries/jinja2.highlights.scm` is the upstream query plus a `(comment) @comment`
line for the new node.

## Capture names

Highlight captures only render when their first dotted segment is one the theme maps
(see `src/treesitter/highlight-map.ts`): `comment, keyword, string, number, constant,
boolean, function, method, type, tag, namespace, property, attribute, field, operator,
punctuation, variable, parameter`, and so on. Captures outside that set are dropped.
