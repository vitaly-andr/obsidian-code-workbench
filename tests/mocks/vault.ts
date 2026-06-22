// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { App, FileSystemAdapter, TFile, TFolder } from "obsidian";
import type { Approval, VaultToolContext } from "../../src/vault-tools/types";

export interface FileSpec {
  content?: string;
  frontmatter?: Record<string, unknown> | null;
  headings?: string[];
  tags?: string[];
  links?: { link: string; displayText?: string; kind?: "link" | "embed" | "frontmatter" }[];
}

function basename(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.md$/, "");
}

// In-memory vault backing a mock Obsidian App, enough to exercise the vault tools end to end.
export class MockVault {
  readonly app: App;
  readonly files = new Map<string, TFile>();
  readonly folders = new Map<string, TFolder>();
  readonly content = new Map<string, string>();
  readonly caches = new Map<string, Record<string, unknown>>();
  readonly frontmatters = new Map<string, Record<string, unknown>>();
  resolvedLinks: Record<string, Record<string, number>> = {};
  unresolvedLinks: Record<string, Record<string, number>> = {};
  readonly trashed: string[] = [];
  readonly created: { path: string; content: string }[] = [];
  readonly renamed: { from: string; to: string }[] = [];
  private activeFile: TFile | null = null;
  private readonly root: TFolder;

  constructor() {
    this.root = new TFolder();
    this.root.path = "";
    this.folders.set("", this.root);

    const adapter = new FileSystemAdapter();
    this.app = {
      vault: {
        adapter,
        getAbstractFileByPath: (p: string) => this.files.get(p) ?? this.folders.get(p) ?? null,
        getFolderByPath: (p: string) => (p === "/" || p === "" ? this.root : this.folders.get(p) ?? null),
        getMarkdownFiles: () => [...this.files.values()].filter((f) => f.extension === "md"),
        cachedRead: async (f: TFile) => this.content.get(f.path) ?? "",
        create: async (p: string, c: string) => {
          this.created.push({ path: p, content: c });
          return this.addFile(p, { content: c });
        },
        process: async (f: TFile, fn: (data: string) => string) => {
          const next = fn(this.content.get(f.path) ?? "");
          this.content.set(f.path, next);
          return next;
        },
      },
      metadataCache: {
        resolvedLinks: this.resolvedLinks,
        unresolvedLinks: this.unresolvedLinks,
        getFileCache: (f: TFile) => this.caches.get(f.path) ?? null,
        getFirstLinkpathDest: (linkpath: string, _src: string) => {
          const direct = this.files.get(linkpath) ?? this.files.get(`${linkpath}.md`);
          if (direct) return direct;
          return [...this.files.values()].find((f) => f.basename === basename(linkpath)) ?? null;
        },
        on: () => ({}),
        offref: () => undefined,
      },
      fileManager: {
        renameFile: async (f: TFile, newPath: string) => {
          this.renamed.push({ from: f.path, to: newPath });
          const c = this.content.get(f.path) ?? "";
          this.files.delete(f.path);
          this.content.delete(f.path);
          this.addFile(newPath, { content: c });
        },
        trashFile: async (f: TFile) => {
          this.trashed.push(f.path);
          this.files.delete(f.path);
          this.content.delete(f.path);
        },
        processFrontMatter: async (f: TFile, fn: (fm: Record<string, unknown>) => void) => {
          const fm = this.frontmatters.get(f.path) ?? {};
          fn(fm);
          this.frontmatters.set(f.path, fm);
        },
      },
      workspace: {
        getActiveFile: () => this.activeFile,
        activeEditor: null,
      },
    } as unknown as App;
  }

  addFile(path: string, spec: FileSpec = {}): TFile {
    const file = new TFile();
    file.path = path;
    file.name = path.split("/").pop() ?? path;
    file.basename = basename(path);
    file.extension = path.includes(".") ? path.split(".").pop() ?? "md" : "md";
    this.files.set(path, file);
    this.content.set(path, spec.content ?? "");
    if (spec.frontmatter !== undefined) this.frontmatters.set(path, spec.frontmatter ?? {});
    const cache: Record<string, unknown> = {};
    if (spec.frontmatter !== undefined) cache.frontmatter = spec.frontmatter;
    if (spec.headings) cache.headings = spec.headings.map((h) => ({ heading: h }));
    if (spec.tags) cache.tags = spec.tags.map((t) => ({ tag: t }));
    if (spec.links) {
      cache.links = spec.links.filter((l) => (l.kind ?? "link") === "link");
      cache.embeds = spec.links.filter((l) => l.kind === "embed");
      cache.frontmatterLinks = spec.links.filter((l) => l.kind === "frontmatter");
    }
    this.caches.set(path, cache);
    // Top-level entries are children of the vault root (mirrors Obsidian, so root listing works).
    if (!path.includes("/")) this.root.children.push(file);
    return file;
  }

  addFolder(path: string): TFolder {
    const folder = new TFolder();
    folder.path = path;
    folder.name = path.split("/").pop() ?? path;
    this.folders.set(path, folder);
    if (!path.includes("/")) this.root.children.push(folder);
    return folder;
  }

  setActive(file: TFile | null): void {
    this.activeFile = file;
  }
}

// An approval stub that records calls and returns a fixed verdict, so tool tests stay deterministic.
export function stubApproval(verdict: {
  contentApproved?: boolean;
  confirmApproved?: boolean;
  editTo?: string;
}): Approval & { contentCalls: number; confirmCalls: number } {
  const state = { contentCalls: 0, confirmCalls: 0 };
  return {
    contentCalls: 0,
    confirmCalls: 0,
    async reviewContent(opts) {
      state.contentCalls += 1;
      this.contentCalls = state.contentCalls;
      return {
        approved: verdict.contentApproved ?? false,
        finalContent: verdict.editTo ?? opts.newContent,
      };
    },
    async confirm() {
      state.confirmCalls += 1;
      this.confirmCalls = state.confirmCalls;
      return verdict.confirmApproved ?? false;
    },
  };
}

export function makeVaultContext(vault: MockVault, approval: Approval, indexed = true): VaultToolContext {
  return { app: vault.app, approval, isIndexed: () => indexed };
}
