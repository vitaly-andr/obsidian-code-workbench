// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// `prettier-v2` is a version alias for prettier@2 (its standalone build) and prettier-plugin-rust
// ships no type declarations; describe just the surface we use.
declare module "prettier-v2/standalone" {
  export function format(source: string, options: unknown): string;
}
declare module "prettier-plugin-rust";
