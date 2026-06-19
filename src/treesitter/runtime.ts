// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Boots the web-tree-sitter engine once, from the runtime wasm embedded in the plugin bundle
// (esbuild's binary loader, see esbuild.config.mjs). The engine never touches the network; only
// per-language grammars are fetched on demand (see the loader/registry). init is idempotent.
import { Parser } from "web-tree-sitter";
import runtimeWasm from "web-tree-sitter/web-tree-sitter.wasm";

let booting: Promise<void> | null = null;

export function initTreeSitter(): Promise<void> {
  if (!booting) {
    // Emscripten accepts a typed array for wasmBinary; the binary loader hands us a Uint8Array.
    booting = Parser.init({ wasmBinary: runtimeWasm as unknown as ArrayBuffer });
  }
  return booting;
}
