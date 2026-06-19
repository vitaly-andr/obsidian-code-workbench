// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// esbuild's binary loader turns a `.wasm` import into a Uint8Array embedded in the bundle.
// Only the web-tree-sitter runtime is imported this way; grammars are downloaded at runtime.
declare module "*.wasm" {
  const data: Uint8Array;
  export default data;
}
