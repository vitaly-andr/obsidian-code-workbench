// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Minimal stand-in for the Obsidian API used at module load by the tested graph.
export class FileSystemAdapter {
  getBasePath(): string {
    return "/vault";
  }
}
export class MarkdownView {}
export class TextFileView {}
export class ItemView {}
export class WorkspaceLeaf {}
export class Plugin {}
export class Notice {
  constructor(_message?: string) {}
}
export class App {}

// File tree primitives. The same classes are shared by the code under test and the tests, so
// `instanceof TFile` / `instanceof TFolder` work on fixtures built in the tests.
export class TAbstractFile {
  path = "";
  name = "";
  parent: TFolder | null = null;
}
export class TFile extends TAbstractFile {
  basename = "";
  extension = "md";
  stat = { ctime: 0, mtime: 0, size: 0 };
}
export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];
  isRoot(): boolean {
    return this.path === "" || this.path === "/";
  }
}

// UI stubs — only needed so approval.ts can be imported; tests drive approval through a stub instead.
export class Modal {
  app: unknown;
  titleEl = { setText(_t: string) {} };
  contentEl = { createEl: () => ({}), empty() {} };
  constructor(app: unknown) {
    this.app = app;
  }
  open(): void {}
  close(): void {}
  onOpen(): void {}
  onClose(): void {}
}
export class Setting {
  constructor(_el: unknown) {}
  addButton(_cb: unknown): this {
    return this;
  }
  setName(): this {
    return this;
  }
  setDesc(): this {
    return this;
  }
}

// normalizePath mirrors Obsidian: clean slashes/whitespace but do NOT resolve "." / ".." — the
// vault-scope guard relies on a crafted ".." surviving here so it can be rejected downstream.
export function normalizePath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/(^\/+|\/+$)/g, "")
    .trim();
}

// getLinkpath strips the #heading / ^block subpath, returning the path portion.
export function getLinkpath(linktext: string): string {
  return linktext.split("#")[0].split("^")[0] || linktext;
}

// Minimal YAML round-trip for tests: one "key: <json>" per line. Enough for the frontmatter tools.
export function stringifyYaml(obj: Record<string, unknown>): string {
  return `${Object.entries(obj)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n")}\n`;
}

export function parseYaml(yaml: string): unknown {
  const out: Record<string, unknown> = {};
  for (const line of yaml.split(/\r?\n/)) {
    const m = /^([^:]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    let value: unknown = m[2];
    try {
      value = JSON.parse(m[2]);
    } catch {
      // leave as the raw string
    }
    out[m[1].trim()] = value;
  }
  return out;
}

export interface SearchResult {
  score: number;
  matches: [number, number][];
}

// A small simple-search stand-in: matches when every space-separated word appears (case-insensitive);
// score is the word count; matches points at the first word. Enough to exercise searchVault ranking.
export function prepareSimpleSearch(query: string): (text: string) => SearchResult | null {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return (text: string) => {
    const lower = text.toLowerCase();
    let score = 0;
    let first: [number, number] | null = null;
    for (const w of words) {
      const idx = lower.indexOf(w);
      if (idx < 0) return null;
      score += 1;
      if (first === null) first = [idx, idx + w.length];
    }
    return { score, matches: first ? [first] : [] };
  };
}

// moment stand-in: a callable returning an always-valid date. The production code casts the obsidian
// `moment` namespace to a callable, so the shape here only needs isValid().
export const moment = ((_input?: string, _format?: string) => ({
  isValid: () => true,
})) as unknown as { (input?: string, format?: string): { isValid(): boolean } };
