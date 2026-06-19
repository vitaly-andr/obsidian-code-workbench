// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// @ruby/prism ships no exports map and parsePrism.js carries no usable types for our purpose;
// treat the subpath (and the embedded wasm) as opaque.
declare module "@ruby/prism/src/parsePrism.js";
