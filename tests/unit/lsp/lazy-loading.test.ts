// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Guards "off = unchanged" (SC-003 / FR-024) at the source level, reproducibly in CI: the heavy LSP
// runtime (src/lsp/index.ts, which pulls @codemirror/lsp-client) must be reached only through a
// dynamic import(), never a top-level static import that would run at plugin load. main.ts may import
// the tiny data-only settings module and types eagerly, but nothing else from src/lsp.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const mainTs = readFileSync(fileURLToPath(new URL("../../../main.ts", import.meta.url)), "utf8");

describe("LSP runtime is lazily loaded (SC-003)", () => {
  it("main.ts reaches the LSP module only via dynamic import()", () => {
    expect(mainTs).toContain('import("./src/lsp")');
  });

  it("main.ts has no eager (static, value) import of the LSP runtime entry", () => {
    // A static value import would be `import { x } from "./src/lsp"` (no `type`). Allowed: the
    // data-only settings module and `import type` of the controller/config.
    const staticValueImport = /import\s+(?!type\b)\{[^}]*\}\s+from\s+["']\.\/src\/lsp["']/;
    expect(staticValueImport.test(mainTs)).toBe(false);
  });

  it("only the settings sub-module (plain data) is imported eagerly from src/lsp", () => {
    // Eager imports from src/lsp/* must be either `import type` or the data-only settings module.
    const eager = [...mainTs.matchAll(/^import\s+(type\s+)?.*from\s+["'](\.\/src\/lsp[^"']*)["'];?$/gm)];
    for (const m of eager) {
      const isType = Boolean(m[1]);
      const spec = m[2];
      if (isType) continue; // erased at build
      expect(spec).toBe("./src/lsp/settings");
    }
  });
});
