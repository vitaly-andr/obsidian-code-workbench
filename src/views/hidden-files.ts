// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { promises as fs } from "fs";
import * as path from "path";

export interface HiddenEntry {
  abs: string;
  rel: string;
}

// Folders never worth walking: huge and not user-editable config.
const SKIP_DIRS = new Set([".git", ".trash", "node_modules"]);
const MAX_FILES = 2000;
const MAX_DIRS = 6000;
const MAX_EDIT_BYTES = 2 * 1024 * 1024;
const BINARY_SNIFF_BYTES = 8192;
const CLASSIFY_CONCURRENCY = 8;

export type FileKind = "text" | "binary" | "toolarge" | "missing";

// Decide whether a file is editable text: small enough and free of NUL bytes. Reads only the head,
// not the whole file, so classifying many candidates during the scan stays cheap.
export async function classifyFile(absPath: string): Promise<FileKind> {
  let size: number;
  try {
    const stat = await fs.stat(absPath);
    if (!stat.isFile()) return "missing";
    size = stat.size;
  } catch {
    return "missing";
  }
  if (size > MAX_EDIT_BYTES) return "toolarge";
  let handle: import("fs").promises.FileHandle | undefined;
  try {
    handle = await fs.open(absPath, "r");
    const length = Math.min(size, BINARY_SNIFF_BYTES);
    const buffer = Buffer.alloc(length);
    if (length > 0) await handle.read(buffer, 0, length, 0);
    for (let i = 0; i < length; i++) {
      if (buffer[i] === 0) return "binary";
    }
    return "text";
  } catch {
    return "missing";
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

// Run `fn` over items with a bounded number in flight.
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

// Walk the vault for files Obsidian hides: anything whose name starts with "." or that lives under a
// dotted folder (e.g. .obsidian/…). Skips .git/.trash/node_modules and binary/oversized files, so the
// list contains only editable text. Bounded so a large vault can't stall the picker. Paths are
// returned both absolute (for fs) and vault-relative (for display).
export async function listHiddenFiles(vaultRoot: string): Promise<HiddenEntry[]> {
  const candidates: HiddenEntry[] = [];
  let dirsVisited = 0;

  const walk = async (dir: string, rel: string, insideHidden: boolean): Promise<void> => {
    if (candidates.length >= MAX_FILES || dirsVisited >= MAX_DIRS) return;
    dirsVisited += 1;
    let entries: import("fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (candidates.length >= MAX_FILES) return;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const childAbs = path.join(dir, entry.name);
      const dotted = entry.name.startsWith(".");
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(childAbs, childRel, insideHidden || dotted);
      } else if (entry.isFile() && (insideHidden || dotted)) {
        candidates.push({ abs: childAbs, rel: childRel });
      }
    }
  };

  await walk(vaultRoot, "", false);

  // Keep only editable text files (drop binary/oversized).
  const kinds = await mapLimit(candidates, CLASSIFY_CONCURRENCY, (c) => classifyFile(c.abs));
  const out = candidates.filter((_, i) => kinds[i] === "text");

  out.sort((a, b) => {
    const ad = a.rel.includes("/") ? 1 : 0;
    const bd = b.rel.includes("/") ? 1 : 0;
    return ad - bd || a.rel.localeCompare(b.rel);
  });
  return out;
}

export interface TreeFolder {
  name: string;
  path: string;
  folders: Map<string, TreeFolder>;
  files: HiddenEntry[];
}

// Group a flat list of vault-relative hidden files into a folder tree for the explorer panel.
export function buildHiddenTree(entries: HiddenEntry[]): TreeFolder {
  const root: TreeFolder = { name: "", path: "", folders: new Map(), files: [] };
  for (const entry of entries) {
    const parts = entry.rel.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      let child = node.folders.get(seg);
      if (!child) {
        child = { name: seg, path: parts.slice(0, i + 1).join("/"), folders: new Map(), files: [] };
        node.folders.set(seg, child);
      }
      node = child;
    }
    node.files.push(entry);
  }
  return root;
}
