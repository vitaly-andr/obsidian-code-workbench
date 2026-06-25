// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// VS Code-style git status in the file explorer. A changed file's name is tinted and gets a one-letter
// badge (M modified, U untracked/new, A added, D deleted, R renamed); a folder that contains changes
// is tinted too; git-ignored files and folders are dimmed. The status is read once per git/vault
// change (loadGitStatus, a child_process call) and cached in Maps; the DOM pass (decorateAll) only
// reads them, so virtual scroll and folder expand/collapse stay cheap. A MutationObserver re-decorates
// on scroll, expand/collapse, and renames — the same pattern as the Material file icons. The maps are
// also exposed (statusFor/isDirChanged/isIgnored) so the hidden-files panel paints the same marks.
import { App } from "obsidian";
import { loadGitStatus, resolveRepository } from "../git/log";
import { vaultBasePath, vaultPathForAbsolute } from "../util/paths";
import type { GitStatusCode } from "../git/types";

const EXPLORER = '.workspace-leaf-content[data-type="file-explorer"]';
const BADGE_CLASS = "cw-git-badge";
const CODE_ATTR = "data-cw-git";
// All status tint/dim classes, so a repaint can clear the previous one before setting the current.
export const GIT_STATUS_CLASSES = [
  "cw-git-M",
  "cw-git-A",
  "cw-git-D",
  "cw-git-R",
  "cw-git-U",
  "cw-git-dir",
  "cw-git-ignored",
];

export class GitDecorations {
  // vault-relative path -> status code (files only). Folder tint is derived in dirChanged.
  private fileStatus = new Map<string, GitStatusCode>();
  private dirChanged = new Set<string>();
  // vault-relative paths git ignores (files and directories); a directory covers its descendants.
  private ignored = new Set<string>();
  private observer: MutationObserver | null = null;
  private container: HTMLElement | null = null;
  private rafQueued = false;
  private enabled = false;
  // Fired after the status maps are rebuilt, so other trees (the hidden-files panel) can repaint.
  onChange: (() => void) | null = null;

  constructor(private readonly app: App) {}

  enable(): void {
    this.enabled = true;
    void this.update();
  }

  disable(): void {
    this.enabled = false;
    this.observer?.disconnect();
    this.observer = null;
    this.container = null;
    this.fileStatus.clear();
    this.dirChanged.clear();
    this.ignored.clear();
    this.clearAll();
  }

  // The status code for a file (vault-relative path), or null if unchanged/unknown. For other views.
  statusFor(vaultRelPath: string): GitStatusCode | null {
    return this.fileStatus.get(vaultRelPath) ?? null;
  }

  // Whether a folder (vault-relative path) contains any changed file. For other views.
  isDirChanged(vaultRelPath: string): boolean {
    return this.dirChanged.has(vaultRelPath);
  }

  // Whether a path is git-ignored — directly, or via an ignored ancestor directory. For other views.
  isIgnored(vaultRelPath: string): boolean {
    if (this.ignored.size === 0) return false;
    if (this.ignored.has(vaultRelPath)) return true;
    for (let dir = parentDir(vaultRelPath); dir; dir = parentDir(dir)) {
      if (this.ignored.has(dir)) return true;
    }
    return false;
  }

  // Re-read git status, then repaint. Called on git ref changes and vault file events. An empty/
  // unreadable result clears stale decorations rather than leaving the previous state on screen.
  async update(): Promise<void> {
    if (!this.enabled) return;
    const status = new Map<string, GitStatusCode>();
    const ignored = new Set<string>();
    const base = vaultBasePath(this.app);
    if (base) {
      try {
        const repo = await resolveRepository(base);
        if (repo.state === "ok" && repo.root) {
          const root = repo.root;
          const toVaultRel = (p: string): string | null =>
            vaultPathForAbsolute(this.app, root.replace(/[\\/]+$/, "") + "/" + p.replace(/^[\\/]+/, ""));
          const { changed, ignored: ign } = await loadGitStatus(repo);
          for (const e of changed) {
            const rel = toVaultRel(e.path);
            if (rel) status.set(rel, e.code); // skip "" (vault root) and null (outside the vault)
          }
          for (const p of ign) {
            const rel = toVaultRel(p);
            if (rel) ignored.add(rel);
          }
        }
      } catch {
        // leave maps empty -> clears stale decorations
      }
    }
    this.fileStatus = status;
    this.ignored = ignored;
    this.dirChanged = new Set();
    for (const p of status.keys()) {
      for (let dir = parentDir(p); dir; dir = parentDir(dir)) this.dirChanged.add(dir);
    }
    if (this.enabled) this.attach();
    this.onChange?.();
  }

  // Re-locate the explorer and repaint (DOM only; uses the cached status). Safe to call repeatedly.
  refresh(): void {
    if (this.enabled) this.attach();
  }

  private attach(): void {
    const container = activeDocument.querySelector<HTMLElement>(EXPLORER);
    if (!container) return;
    if (container !== this.container) {
      this.observer?.disconnect();
      this.container = container;
      this.observer = new MutationObserver(() => this.schedule());
      this.observer.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-path", "class"],
      });
    }
    this.decorateAll();
  }

  // Coalesce mutation bursts (scroll, expand, hover/active class churn) into one pass per frame.
  private schedule(): void {
    if (this.rafQueued) return;
    this.rafQueued = true;
    window.requestAnimationFrame(() => {
      this.rafQueued = false;
      this.decorateAll();
    });
  }

  private decorateAll(): void {
    const root = this.container;
    if (!root) return;
    root
      .querySelectorAll<HTMLElement>(".nav-file-title, .nav-folder-title")
      .forEach((el) => this.decorate(el));
  }

  private decorate(el: HTMLElement): void {
    const path = el.getAttribute("data-path");
    if (!path) return;
    const isFolder = el.classList.contains("nav-folder-title");
    const code: GitStatusCode | "dir" | "ignored" | null = isFolder
      ? this.dirChanged.has(path)
        ? "dir"
        : this.isIgnored(path)
          ? "ignored"
          : null
      : (this.fileStatus.get(path) ?? (this.isIgnored(path) ? "ignored" : null));
    const want = code ?? "";
    if (el.getAttribute(CODE_ATTR) === want) return; // already in the right state
    el.setAttribute(CODE_ATTR, want);
    el.classList.remove(...GIT_STATUS_CLASSES);
    const badge = el.querySelector<HTMLElement>(`:scope > .${BADGE_CLASS}`);
    if (!code) {
      badge?.remove();
      return;
    }
    el.classList.add(`cw-git-${code}`);
    if (code === "dir" || code === "ignored") {
      badge?.remove(); // tint/dim only, no letter
      return;
    }
    const span = badge ?? el.createSpan({ cls: BADGE_CLASS });
    span.setText(code);
  }

  private clearAll(): void {
    activeDocument.querySelectorAll<HTMLElement>(`[${CODE_ATTR}]`).forEach((el) => {
      el.removeAttribute(CODE_ATTR);
      el.classList.remove(...GIT_STATUS_CLASSES);
    });
    activeDocument.querySelectorAll<HTMLElement>(`.${BADGE_CLASS}`).forEach((el) => el.remove());
  }
}

function parentDir(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}
