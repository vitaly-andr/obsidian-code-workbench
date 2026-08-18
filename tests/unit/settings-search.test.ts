// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { describe, expect, it } from "vitest";
import type CodeWorkbenchPlugin from "../../main";
import { buildSettingDefinitions } from "../../src/settings/definitions";
import { isGroup } from "../../src/settings/types";
import type { CwDef, CwItem } from "../../src/settings/types";

// Settings search is the whole point of the declarative tab (017), and the words it matches on are
// spread across ~25 rows — exactly the kind of vocabulary that rots silently. These tests apply
// Obsidian's own matching rules to the definitions the plugin returns.
//
// Both rules were read from `app.js` (1.13.7) rather than assumed:
//   * collection — a definition is indexed unless `visible` or `searchable` evaluates to false,
//     and a hidden group takes its rows with it. Group headings are never indexed.
//   * matching — the query is lowercased and split on spaces; a target matches when *every* token
//     occurs in it as a substring. Name, description and each alias are matched separately, so a
//     two-word query has to be contained in one of them, not spread across two.

interface Entry {
  name: string;
  targets: string[];
}

function collect(items: CwItem[]): Entry[] {
  const entries: Entry[] = [];
  for (const item of items) {
    if (isGroup(item)) {
      if (item.visible && !item.visible()) continue;
      entries.push(...collect(item.items));
      continue;
    }
    if (item.visible && !item.visible()) continue;
    if (item.searchable === false) continue;
    entries.push({ name: item.name, targets: [item.name, item.desc ?? "", ...(item.aliases ?? [])] });
  }
  return entries;
}

function matches(query: string, entry: Entry): boolean {
  const tokens = query.toLowerCase().split(" ").filter(Boolean);
  return entry.targets.some((target) => {
    const haystack = target.toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}

function search(items: CwItem[], query: string): string[] {
  return collect(items)
    .filter((entry) => matches(query, entry))
    .map((entry) => entry.name);
}

function stubPlugin(lspEnabled: boolean): CodeWorkbenchPlugin {
  return {
    manifest: { version: "0.0.0" },
    settings: {
      vaultTools: false,
      launchProfiles: [],
      lsp: { enabled: lspEnabled, perLanguage: {}, customServers: {} },
    },
    openGitGraphPanel: () => Promise.resolve(),
  } as unknown as CodeWorkbenchPlugin;
}

const definitions = (lspEnabled = true): CwItem[] =>
  buildSettingDefinitions(stubPlugin(lspEnabled), { refresh: () => {} });

describe("settings search index", () => {
  // SC-001: the queries a user brings from other editors, none of which the tab answered before.
  const keywords = [
    "blame",
    "hidden",
    "icons",
    "syntax",
    "indent",
    "inlay",
    "semantic",
    "folding",
    "lsp",
    "diagnostics",
    "selection",
    "terminal",
    "mcp",
    "vault tools",
    "language server",
    "prettier",
    "branch",
    "diff",
    "intellisense",
    "dotfiles",
    "source control",
    "material icons",
    "pyright",
  ];

  for (const keyword of keywords) {
    it(`finds a setting for "${keyword}"`, () => {
      expect(search(definitions(), keyword).length).toBeGreaterThan(0);
    });
  }

  it("puts each keyword on the row it is meant for", () => {
    const intended: Record<string, string> = {
      blame: "Inline git blame",
      dotfiles: "Show hidden files",
      "material icons": "File type icons",
      mcp: "Vault tools (Claude)",
      lsp: "Language server (LSP)",
      pyright: "Language server (LSP)",
      intellisense: "Language server (LSP)",
      prettier: "Format code file",
      branch: "Git graph",
      "side by side": "Keep/Reject diff",
    };
    for (const [keyword, name] of Object.entries(intended)) {
      expect(search(definitions(), keyword), keyword).toContain(name);
    }
  });

  it("matches regardless of word order", () => {
    expect(search(definitions(), "server language")).toEqual(search(definitions(), "language server"));
  });

  it("drops the gated rows from the index while their gate is off", () => {
    // Obsidian evaluates `visible` when it collects entries, so a hidden row is unsearchable for
    // as long as it is hidden — no re-index needed.
    expect(search(definitions(false), "inlay")).toHaveLength(0);
    expect(search(definitions(false), "semantic")).toHaveLength(0);
    // The switch that brings them back stays findable.
    expect(search(definitions(false), "lsp")).toContain("Language server (LSP)");
  });

  it("gives every indexed row a name to show as the result", () => {
    // The result list renders `definition.name`; a nameless row would be a blank result.
    for (const entry of collect(definitions())) expect(entry.name).not.toBe("");
  });

  it("keeps row names unique", () => {
    // Obsidian keys rows by name when it reconciles a re-render, and logs an error on a collision.
    const names = collect(definitions()).map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("does not spend an alias on a term the row already says", () => {
    // Score is the best of name/desc/aliases, so a repeated term buys nothing; the alias slots are
    // for the words the row does *not* use.
    const wasted: string[] = [];
    const check = (items: CwItem[]): void => {
      for (const item of items) {
        if (isGroup(item)) {
          check(item.items);
          continue;
        }
        const def: CwDef = item;
        const own = `${def.name} ${def.desc ?? ""}`.toLowerCase();
        for (const alias of def.aliases ?? []) {
          if (own.includes(alias.toLowerCase())) wasted.push(`${def.name}: "${alias}"`);
        }
      }
    };
    check(definitions());
    expect(wasted).toEqual([]);
  });
});
