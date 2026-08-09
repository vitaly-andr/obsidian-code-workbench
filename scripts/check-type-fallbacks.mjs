// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Guard for the `paths` mapping in tsconfig.json (see types/).
//
// Every entry lists the dependency's own .d.ts first and a repo-local declaration second, so an
// installed checkout compiles against the real types and a dependency-free lint still resolves
// something. That only holds while the first target exists. When it does not — a package moves its
// declarations, or an entry names the wrong file — TypeScript quietly falls through to the fallback.
// The fallback file then joins the program, and every `declare module` in it shadows the real
// package, so a single wrong path can swap out types across the codebase. That failure is easy to
// miss: it does not look like a broken path, it looks like mysterious type errors somewhere else.
//
// Run: node scripts/check-type-fallbacks.mjs

import { readFileSync, existsSync } from "node:fs";

const raw = readFileSync("tsconfig.json", "utf8");
// tsconfig allows // comments; JSON.parse does not.
const paths = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, "")).compilerOptions?.paths ?? {};

const problems = [];
let checked = 0;

for (const [specifier, targets] of Object.entries(paths)) {
  const [real, fallback] = targets;
  if (!fallback) {
    problems.push(`${specifier}: no fallback declaration listed`);
    continue;
  }
  if (!existsSync(fallback.replace("*", "index"))) {
    problems.push(`${specifier}: fallback ${fallback} does not exist`);
  }
  // A wildcard entry stands for many files; check the directory it lives in instead.
  const probe = real.includes("*") ? real.slice(0, real.indexOf("*")) : real;
  checked++;
  if (!existsSync(probe)) {
    problems.push(`${specifier}: ${real} does not exist — the fallback would take over`);
  }
}

if (problems.length > 0) {
  console.error("tsconfig paths are broken:\n  " + problems.join("\n  "));
  process.exit(1);
}

console.log(`tsconfig paths: ${checked} entries resolve to installed declarations.`);
