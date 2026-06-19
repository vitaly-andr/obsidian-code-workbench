// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Formatting for languages Prettier doesn't cover, via @wasm-fmt formatters (Go=gofmt,
// Python=ruff). Each formatter's wasm is downloaded on first use and cached in the plugin folder,
// then the /web build is initialized from those bytes — the same lazy, offline-after-first model as
// tree-sitter grammars. The bundle stays small; nothing is fetched until you format such a file.
import { DataAdapter, requestUrl } from "obsidian";
import gofmtInit, { format as gofmtFormat } from "@wasm-fmt/gofmt/web";
import ruffInit, { format as ruffFormat } from "@wasm-fmt/ruff_fmt/web";
import clangInit, { format as clangFormat } from "@wasm-fmt/clang-format/web";
import sqlInit, { format as sqlFormat } from "@wasm-fmt/sql_fmt/web";
import shInit, { format as shFormat } from "@wasm-fmt/shfmt/web";
import phpInit, { format as phpFormat } from "@wasm-fmt/mago_fmt/web";
import luaInit, { format as luaFormat } from "@wasm-fmt/lua_fmt/web";
import tomlInit, { format as tomlFormat } from "@wasm-fmt/taplo_fmt/web";
import zigInit, { format as zigFormat } from "@wasm-fmt/zig_fmt/web";
import dartInit, { format as dartFormat } from "@wasm-fmt/dart_fmt/web";
import { warn } from "../util/log";

interface FormatterDef {
  id: string;
  wasmUrl: string; // pinned so the wasm matches the bundled /web glue
  // init is fed a Response, not raw bytes: the @wasm-fmt packages use different wasm-bindgen
  // versions, and only a Response (with a wasm content-type) satisfies all of them.
  init: (input: Response) => Promise<unknown>;
  run: (source: string, filename: string) => string;
}

const JSDELIVR = "https://cdn.jsdelivr.net/npm";

const FORMATTERS: Record<string, FormatterDef> = {
  gofmt: {
    id: "gofmt",
    wasmUrl: `${JSDELIVR}/@wasm-fmt/gofmt@0.7.3/gofmt.wasm`,
    init: (b) => gofmtInit(b),
    run: (src) => gofmtFormat(src),
  },
  ruff: {
    id: "ruff",
    wasmUrl: `${JSDELIVR}/@wasm-fmt/ruff_fmt@0.15.16/ruff_fmt_bg.wasm`,
    init: (b) => ruffInit(b),
    run: (src, file) => ruffFormat(src, file),
  },
  // clang-format covers the C family + Java; the filename's extension selects the dialect.
  clang: {
    id: "clang",
    wasmUrl: `${JSDELIVR}/@wasm-fmt/clang-format@22.1.7/clang-format.wasm`,
    init: (b) => clangInit(b),
    run: (src, file) => clangFormat(src, file),
  },
  sql: {
    id: "sql",
    wasmUrl: `${JSDELIVR}/@wasm-fmt/sql_fmt@0.2.2/sql_fmt_bg.wasm`,
    init: (b) => sqlInit(b),
    run: (src) => sqlFormat(src),
  },
  shfmt: {
    id: "shfmt",
    wasmUrl: `${JSDELIVR}/@wasm-fmt/shfmt@0.2.7/shfmt.wasm`,
    init: (b) => shInit(b),
    run: (src) => shFormat(src),
  },
  php: {
    id: "php",
    wasmUrl: `${JSDELIVR}/@wasm-fmt/mago_fmt@0.10.7/mago_fmt_bg.wasm`,
    init: (b) => phpInit(b),
    run: (src) => phpFormat(src),
  },
  lua: {
    id: "lua",
    wasmUrl: `${JSDELIVR}/@wasm-fmt/lua_fmt@0.3.3/lua_fmt_bg.wasm`,
    init: (b) => luaInit(b),
    run: (src) => luaFormat(src),
  },
  // TOML via Taplo's wasm (downloaded, ~340KB) — not the Prettier toml plugin, which inlines it at 34MB.
  toml: {
    id: "toml",
    wasmUrl: `${JSDELIVR}/@wasm-fmt/taplo_fmt@0.2.5/taplo_fmt_bg.wasm`,
    init: (b) => tomlInit(b),
    run: (src) => tomlFormat(src),
  },
  zig: {
    id: "zig",
    wasmUrl: `${JSDELIVR}/@wasm-fmt/zig_fmt@0.16.0/zig_fmt.wasm`,
    init: (b) => zigInit(b),
    run: (src) => zigFormat(src),
  },
  // Dart's formatter is dart2wasm (WasmGC); the wasm is dart_fmt.wasm (no _bg suffix). It traps in
  // Node but runs correctly in a Chromium renderer (verified in Chrome = Obsidian's Electron).
  dart: {
    id: "dart",
    wasmUrl: `${JSDELIVR}/@wasm-fmt/dart_fmt@0.4.0/dart_fmt.wasm`,
    init: (b) => dartInit(b),
    run: (src, file) => dartFormat(src, file),
  },
};

// Extension -> formatter + the filename to present (some formatters infer dialect from it).
const EXT_TO_FORMATTER: Record<string, { id: string; filename: string }> = {
  go: { id: "gofmt", filename: "main.go" },
  py: { id: "ruff", filename: "main.py" },
  pyw: { id: "ruff", filename: "main.py" },
  pyi: { id: "ruff", filename: "main.pyi" },
  // clang-format — extension drives the dialect (C vs C++ vs ObjC vs Java).
  c: { id: "clang", filename: "x.c" },
  h: { id: "clang", filename: "x.h" },
  cpp: { id: "clang", filename: "x.cpp" },
  cc: { id: "clang", filename: "x.cc" },
  cxx: { id: "clang", filename: "x.cxx" },
  hpp: { id: "clang", filename: "x.hpp" },
  hh: { id: "clang", filename: "x.hh" },
  hxx: { id: "clang", filename: "x.hxx" },
  m: { id: "clang", filename: "x.m" },
  mm: { id: "clang", filename: "x.mm" },
  java: { id: "clang", filename: "x.java" },
  sql: { id: "sql", filename: "x.sql" },
  sh: { id: "shfmt", filename: "x.sh" },
  bash: { id: "shfmt", filename: "x.sh" },
  zsh: { id: "shfmt", filename: "x.sh" },
  ksh: { id: "shfmt", filename: "x.sh" },
  php: { id: "php", filename: "x.php" },
  lua: { id: "lua", filename: "x.lua" },
  toml: { id: "toml", filename: "x.toml" },
  zig: { id: "zig", filename: "x.zig" },
  dart: { id: "dart", filename: "main.dart" },
};

export class WasmFormatterLoader {
  private readonly ready = new Map<string, Promise<boolean>>();

  constructor(
    private readonly adapter: DataAdapter,
    private readonly cacheDir: string,
  ) {}

  canFormat(ext: string): boolean {
    return ext in EXT_TO_FORMATTER;
  }

  // Formatted text, or null if unsupported, offline on first use, or the formatter rejected the
  // input (e.g. a syntax error) — caller then leaves the file untouched.
  async format(text: string, ext: string): Promise<string | null> {
    const route = EXT_TO_FORMATTER[ext];
    if (!route) return null;
    const def = FORMATTERS[route.id];
    if (!(await this.ensure(def))) {
      warn(`formatter "${def.id}" is unavailable (download/init failed)`);
      return null;
    }
    try {
      return def.run(text, route.filename);
    } catch (e) {
      warn(`formatter "${def.id}" threw on .${ext}: ${String(e)}`);
      return null;
    }
  }

  private ensure(def: FormatterDef): Promise<boolean> {
    let pending = this.ready.get(def.id);
    if (!pending) {
      pending = this.boot(def).catch((e) => {
        warn(`formatter "${def.id}" failed to initialize: ${String(e)}`);
        return false;
      });
      this.ready.set(def.id, pending);
    }
    return pending;
  }

  private async boot(def: FormatterDef): Promise<boolean> {
    const path = `${this.cacheDir}/fmt-${def.id}.wasm`;
    let bytes: ArrayBuffer | null = null;
    if (await this.adapter.exists(path)) {
      bytes = await this.adapter.readBinary(path);
    } else {
      const res = await requestUrl({ url: def.wasmUrl, throw: false });
      if (res.status !== 200) return false;
      if (!(await this.adapter.exists(this.cacheDir))) {
        try {
          await this.adapter.mkdir(this.cacheDir);
        } catch {
          /* concurrent create */
        }
      }
      await this.adapter.writeBinary(path, res.arrayBuffer);
      bytes = res.arrayBuffer;
    }
    // A Response (with a wasm content-type) is the one init form every @wasm-fmt package accepts —
    // some expect a fetch-like object and call .arrayBuffer(), others accept bytes; Response covers both.
    await def.init(new Response(bytes, { headers: { "Content-Type": "application/wasm" } }));
    return true;
  }
}
