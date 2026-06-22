// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { describe, expect, it } from "vitest";
import { App, FileSystemAdapter } from "obsidian";
import { vaultPathForAbsolute } from "../../src/util/paths";
import { buildHiddenTree, HiddenEntry } from "../../src/views/hidden-files";

// FileSystemAdapter.getBasePath() returns "/vault" in the mock, so this app's vault root is /vault.
const app = { vault: { adapter: new FileSystemAdapter() } } as unknown as App;

describe("hidden files", () => {
  // The HiddenFileView confinement guard (inVault) is exactly vaultPathForAbsolute !== null. These
  // lock the security property: a dot-file inside the vault is editable; any path that resolves
  // outside the vault root — including via ".." or a look-alike prefix — is refused.
  describe("vault confinement guard", () => {
    it("accepts dot-files inside the vault", () => {
      expect(vaultPathForAbsolute(app, "/vault/.obsidian/app.json")).toBe(".obsidian/app.json");
      expect(vaultPathForAbsolute(app, "/vault/.gitignore")).toBe(".gitignore");
      expect(vaultPathForAbsolute(app, "/vault")).toBe("");
    });

    it("refuses paths outside the vault, including .. escapes and look-alike prefixes", () => {
      expect(vaultPathForAbsolute(app, "/home/user/.bashrc")).toBeNull();
      expect(vaultPathForAbsolute(app, "/vault/../secret")).toBeNull();
      expect(vaultPathForAbsolute(app, "/vault/.obsidian/../../etc/passwd")).toBeNull();
      expect(vaultPathForAbsolute(app, "/vaultlike/x")).toBeNull();
    });
  });

  describe("buildHiddenTree", () => {
    it("groups a flat list into a nested folder tree", () => {
      const entries: HiddenEntry[] = [
        { abs: "/vault/.gitignore", rel: ".gitignore" },
        { abs: "/vault/.obsidian/app.json", rel: ".obsidian/app.json" },
        { abs: "/vault/.obsidian/plugins/x/data.json", rel: ".obsidian/plugins/x/data.json" },
      ];
      const tree = buildHiddenTree(entries);
      expect(tree.files.map((f) => f.rel)).toEqual([".gitignore"]);
      const obsidian = tree.folders.get(".obsidian");
      expect(obsidian).toBeTruthy();
      expect(obsidian?.files.map((f) => f.rel)).toEqual([".obsidian/app.json"]);
      const deep = obsidian?.folders.get("plugins")?.folders.get("x");
      expect(deep?.files.map((f) => f.rel)).toEqual([".obsidian/plugins/x/data.json"]);
    });
  });
});
