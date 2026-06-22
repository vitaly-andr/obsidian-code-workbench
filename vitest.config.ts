// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

// `obsidian` is provided by the host at runtime; stub it for headless tests. The daily-notes
// interface is bundled at build time but stubbed here so tests don't pull its moment/obsidian graph.
export default defineConfig({
  resolve: {
    alias: {
      obsidian: fileURLToPath(new URL("./tests/mocks/obsidian.ts", import.meta.url)),
      "obsidian-daily-notes-interface": fileURLToPath(
        new URL("./tests/mocks/daily-notes.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
  },
});
