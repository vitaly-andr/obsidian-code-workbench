// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// @ruby/prism ships no exports map and parsePrism.js carries no usable types, so declare just the one
// function we call: parsePrism(wasmExports, source, options) -> the (opaque) prism parse result.
declare module "@ruby/prism/src/parsePrism.js" {
  export function parsePrism(
    wasmExports: WebAssembly.Exports,
    source: string,
    options: Record<string, unknown>,
  ): unknown;
}
