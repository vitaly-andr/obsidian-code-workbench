// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Lazily downloads, caches, and loads tree-sitter grammars. On first use of a language the grammar
// .wasm (and its highlights query) are fetched via Obsidian's requestUrl (no CORS) and written to
// the plugin's data folder; subsequent opens read the cache and need no network. Each grammar id is
// loaded at most once per session (memoized promise).
import { DataAdapter, requestUrl } from "obsidian";
import { Language, Parser, Query } from "web-tree-sitter";
import { initTreeSitter } from "./runtime";
import type { GrammarSource } from "./registry";
import { grammarById, normalizeLang } from "./registry";
import { warn } from "../util/log";

export interface LoadedGrammar {
  parser: Parser;
  query: Query | null;
  // Embedded-language regions (from injections.scm) with the grammars to colour them, pre-loaded.
  injections?: { query: Query; grammars: Map<string, LoadedGrammar> } | null;
}

export class GrammarLoader {
  private readonly cache = new Map<string, Promise<LoadedGrammar | null>>();

  constructor(
    private readonly adapter: DataAdapter,
    private readonly cacheDir: string,
  ) {}

  // null = grammar unavailable (offline first-use, 404, ABI mismatch). Caller keeps the fallback.
  load(src: GrammarSource): Promise<LoadedGrammar | null> {
    let pending = this.cache.get(src.id);
    if (!pending) {
      pending = this.doLoad(src)
        .catch((e) => {
          warn(`tree-sitter: grammar "${src.id}" failed to load: ${String(e)}`);
          return null;
        })
        .then((g) => {
          // Don't memoize failures (e.g. offline on first use): drop the entry so a later open
          // retries the download once back online. Successful loads stay cached for the session.
          if (!g) this.cache.delete(src.id);
          return g;
        });
      this.cache.set(src.id, pending);
    }
    return pending;
  }

  private async doLoad(src: GrammarSource): Promise<LoadedGrammar | null> {
    await initTreeSitter();
    const wasm = await this.fetchBinary(`${src.id}.wasm`, src.wasmUrl);
    if (!wasm) return null;
    const language = await Language.load(new Uint8Array(wasm));
    const parser = new Parser();
    parser.setLanguage(language);

    let query: Query | null = null;
    if (src.highlightsUrl) {
      let scm = await this.fetchText(`${src.id}.highlights.scm`, src.highlightsUrl);
      // Grammars that extend another (cpp←c, ts/tsx←js) ship only their delta; prepend the base
      // grammar's highlights so the shared tokens are captured too.
      if (scm && src.baseHighlightsUrl) {
        const base = await this.fetchText(`${src.id}.base.scm`, src.baseHighlightsUrl);
        if (base) scm = `${base}\n${scm}`;
      }
      if (scm) {
        try {
          query = new Query(language, scm);
        } catch (e) {
          // A query that references node types the grammar version lacks: keep diagnostics, drop
          // highlighting for this language rather than failing the whole grammar.
          warn(`tree-sitter: highlights query for "${src.id}" did not compile: ${String(e)}`);
        }
      }
    }

    // Injections: compile the injections query and pre-load the grammars it references (typescript,
    // css, javascript…) so the highlighter can colour embedded <script>/<style>/frontmatter regions.
    let injections: LoadedGrammar["injections"] = null;
    const injScm =
      src.injectionsScm ??
      (src.injectionsUrl ? await this.fetchText(`${src.id}.injections.scm`, src.injectionsUrl) : null);
    if (injScm) {
      try {
        const injQuery = new Query(language, injScm);
        const grammars = new Map<string, LoadedGrammar>();
        const langs = new Set(
          Array.from(injScm.matchAll(/injection\.language\s+"(\w+)"/g), (m) => normalizeLang(m[1])),
        );
        for (const id of langs) {
          const injSrc = grammarById(id);
          if (injSrc) {
            const g = await this.load(injSrc);
            if (g) grammars.set(id, g);
          }
        }
        injections = { query: injQuery, grammars };
      } catch (e) {
        warn(`tree-sitter: injections for "${src.id}" failed: ${String(e)}`);
      }
    }
    return { parser, query, injections };
  }

  private async ensureDir(): Promise<void> {
    if (!(await this.adapter.exists(this.cacheDir))) {
      try {
        await this.adapter.mkdir(this.cacheDir);
      } catch {
        /* concurrent create — ignore */
      }
    }
  }

  // Cache filename carries a hash of the URL, so when a grammar's source changes (e.g. npm -> a
  // self-built release asset) the old cached file is no longer matched and the new one downloads.
  private cachePath(name: string, url: string): string {
    let h = 0;
    for (let i = 0; i < url.length; i++) h = (Math.imul(h, 31) + url.charCodeAt(i)) | 0;
    return `${this.cacheDir}/${name}.${(h >>> 0).toString(36)}`;
  }

  private async fetchBinary(name: string, url: string): Promise<ArrayBuffer | null> {
    const path = this.cachePath(name, url);
    if (await this.adapter.exists(path)) return this.adapter.readBinary(path);
    const res = await requestUrl({ url, throw: false });
    if (res.status !== 200) return null;
    await this.ensureDir();
    await this.adapter.writeBinary(path, res.arrayBuffer);
    return res.arrayBuffer;
  }

  private async fetchText(name: string, url: string): Promise<string | null> {
    const path = this.cachePath(name, url);
    if (await this.adapter.exists(path)) return this.adapter.read(path);
    const res = await requestUrl({ url, throw: false });
    if (res.status !== 200) return null;
    await this.ensureDir();
    await this.adapter.write(path, res.text);
    return res.text;
  }
}
