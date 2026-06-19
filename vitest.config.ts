import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

// `obsidian` is provided by the host at runtime; stub it for headless tests.
export default defineConfig({
  resolve: {
    alias: {
      obsidian: fileURLToPath(new URL("./tests/mocks/obsidian.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
