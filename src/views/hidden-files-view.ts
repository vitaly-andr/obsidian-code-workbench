// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import * as path from "path";
import { ItemView, Menu, Notice, setIcon, WorkspaceLeaf } from "obsidian";
import type { IconLoader } from "../icons/icon-loader";
import { fileIconName, folderIconName } from "../icons/icon-names";
import { buildHiddenTree, HiddenEntry, TreeFolder } from "./hidden-files";
import { HIDDEN_TREE_VIEW_TYPE } from "./view-types";
import { GIT_STATUS_CLASSES } from "../decorations/git-decorations";
import type { GitDecorations } from "../decorations/git-decorations";
import type { GitStatusCode } from "../git/types";
import { ConfirmModal, RenameModal } from "./prompts";
import { vaultBasePath } from "../util/paths";
import { error } from "../util/log";

// Electron clipboard and shell, for the tree's right-click actions (copy path, reveal in the system
// file manager). Null if unavailable — the items then report it. Reached the same way as openExternal.
function electronModule<T>(key: "clipboard" | "shell"): T | null {
  try {
    const req = (window as unknown as { require?: (m: string) => unknown }).require;
    const electron = req?.("electron") as Record<string, unknown> | undefined;
    return (electron?.[key] as T) ?? null;
  } catch {
    return null;
  }
}

const BADGE_CLASS = "cw-git-badge";
const PATH_ATTR = "data-cw-path";

// What the panel needs from the plugin, kept narrow to avoid a plugin <-> view import cycle.
export interface HiddenFilesHost {
  listHiddenFiles(): Promise<HiddenEntry[]>;
  openHiddenFile(abs: string, mode?: "tab" | "split" | "window"): void | Promise<void>;
  getIconLoader(): IconLoader | null;
  fileIconsEnabled(): boolean;
  // The explorer git decorations, so the panel can paint the same status onto its hidden-file rows.
  getGitDecorations(): GitDecorations | null;
  // Diff a hidden file's working-tree copy against the last commit (right-click action).
  openWorkingDiffAbs(absPath: string, displayName: string): void;
}

// A sidebar explorer for the vault's hidden (dot) files, rendered as a collapsible tree using
// Obsidian's own nav/tree CSS classes so it matches the file explorer (indentation, hovers, theme).
// Folders start collapsed; clicking a file opens it in the editable hidden-file view. When the
// "File type icons" setting is on, nodes show the same Material icons as the explorer. When git
// decorations are on, hidden files carry the same status tint/badge as the explorer — the file
// explorer never shows dot-files, so this panel is the only place their git status is visible.
export class HiddenFilesView extends ItemView {
  private readonly expanded = new Set<string>();
  // icon name -> background-image value (data: URL), cached for the session.
  private readonly iconUrls = new Map<string, string>();

  constructor(
    leaf: WorkspaceLeaf,
    private readonly host: HiddenFilesHost,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return HIDDEN_TREE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Hidden files";
  }

  getIcon(): string {
    return "eye";
  }

  async onOpen(): Promise<void> {
    this.addAction("refresh-cw", "Rescan hidden files", () => void this.refresh());
    await this.refresh();
  }

  // Re-scan the vault and rebuild the tree. Called on open, on the refresh action, and when the
  // file-icons setting changes.
  async refresh(): Promise<void> {
    const entries = await this.host.listHiddenFiles();
    this.renderTree(entries);
  }

  // Repaint git status onto the existing rows — a cheap DOM pass with no filesystem re-scan. Called
  // by the plugin whenever the git status map changes (commit, file edit, window focus).
  repaintGitStatus(): void {
    this.contentEl.querySelectorAll<HTMLElement>(".nav-file-title, .nav-folder-title").forEach((self) => {
      const rel = self.getAttribute(PATH_ATTR);
      if (rel === null) return;
      this.decorateRow(self, rel, self.classList.contains("nav-folder-title"));
    });
  }

  private renderTree(entries: HiddenEntry[]): void {
    const container = this.contentEl;
    container.empty();
    container.addClass("cw-hidden-tree", "nav-files-container");
    if (entries.length === 0) {
      container.createDiv({ cls: "pane-empty", text: "No hidden files found." });
      return;
    }
    const root = buildHiddenTree(entries);
    const treeRoot = container.createDiv({ cls: "nav-folder mod-root" });
    const children = treeRoot.createDiv({ cls: "tree-item-children nav-folder-children" });
    this.renderChildren(root, children);
  }

  private renderChildren(folder: TreeFolder, parentEl: HTMLElement): void {
    const folders = [...folder.folders.values()].sort((a, b) => a.name.localeCompare(b.name));
    for (const child of folders) this.renderFolder(child, parentEl);
    const files = [...folder.files].sort((a, b) => a.rel.localeCompare(b.rel));
    for (const file of files) this.renderFile(file, parentEl);
  }

  private renderFolder(folder: TreeFolder, parentEl: HTMLElement): void {
    const expanded = this.expanded.has(folder.path);
    const item = parentEl.createDiv({ cls: `tree-item nav-folder${expanded ? "" : " is-collapsed"}` });
    const self = item.createDiv({ cls: "tree-item-self nav-folder-title is-clickable mod-collapsible" });
    self.setAttribute(PATH_ATTR, folder.path);

    const chevron = self.createDiv({ cls: "cw-tree-chevron" });
    setIcon(chevron, "chevron-right");

    let iconSpan: HTMLElement | null = null;
    if (this.host.fileIconsEnabled()) {
      iconSpan = self.createSpan({ cls: "cw-nav-icon" });
      void this.paintIcon(iconSpan, folderIconName(folder.path, expanded, this.app.vault.configDir));
    }
    self.createDiv({ cls: "tree-item-inner nav-folder-title-content", text: folder.name });
    this.decorateRow(self, folder.path, true);
    self.addEventListener("contextmenu", (evt) => this.showFolderMenu(evt, folder));

    const childrenEl = item.createDiv({ cls: "tree-item-children nav-folder-children" });
    self.addEventListener("click", () => {
      const willExpand = item.classList.contains("is-collapsed");
      item.classList.toggle("is-collapsed", !willExpand);
      if (willExpand) this.expanded.add(folder.path);
      else this.expanded.delete(folder.path);
      if (iconSpan) void this.paintIcon(iconSpan, folderIconName(folder.path, willExpand, this.app.vault.configDir));
    });

    this.renderChildren(folder, childrenEl);
  }

  private renderFile(file: HiddenEntry, parentEl: HTMLElement): void {
    const item = parentEl.createDiv({ cls: "tree-item nav-file" });
    const self = item.createDiv({ cls: "tree-item-self nav-file-title is-clickable" });
    self.setAttribute(PATH_ATTR, file.rel);
    if (this.host.fileIconsEnabled()) {
      const iconSpan = self.createSpan({ cls: "cw-nav-icon" });
      void this.paintIcon(iconSpan, fileIconName(file.rel));
    }
    self.createDiv({ cls: "tree-item-inner nav-file-title-content", text: path.basename(file.rel) });
    this.decorateRow(self, file.rel, false);
    self.addEventListener("click", () => void this.host.openHiddenFile(file.abs));
    self.addEventListener("contextmenu", (evt) => this.showFileMenu(evt, file));
  }

  // Apply (or clear) the git status tint + badge on one row, from the shared decorations map.
  private decorateRow(self: HTMLElement, rel: string, isFolder: boolean): void {
    const dec = this.host.getGitDecorations();
    self.classList.remove(...GIT_STATUS_CLASSES);
    const existing = self.querySelector<HTMLElement>(`:scope > .${BADGE_CLASS}`);
    const code: GitStatusCode | "dir" | "ignored" | null = !dec
      ? null
      : isFolder
        ? dec.isDirChanged(rel)
          ? "dir"
          : dec.isIgnored(rel)
            ? "ignored"
            : null
        : (dec.statusFor(rel) ?? (dec.isIgnored(rel) ? "ignored" : null));
    if (!code) {
      existing?.remove();
      return;
    }
    self.classList.add(`cw-git-${code}`);
    if (code === "dir" || code === "ignored") {
      existing?.remove(); // tint/dim only, no letter
      return;
    }
    (existing ?? self.createSpan({ cls: BADGE_CLASS })).setText(code);
  }

  // Right-click a file. These aren't vault TFiles, so Obsidian's own file-menu (and other plugins'
  // entries) can't run here; the standard actions are reproduced as a normal menu, plus our git diff.
  private showFileMenu(evt: MouseEvent, file: HiddenEntry): void {
    evt.preventDefault();
    const name = path.basename(file.rel);
    const menu = new Menu();
    menu.addItem((i) =>
      i.setTitle("Open in new tab").setIcon("file").onClick(() => void this.host.openHiddenFile(file.abs)),
    );
    menu.addItem((i) =>
      i
        .setTitle("Open to the right")
        .setIcon("separator-vertical")
        .onClick(() => void this.host.openHiddenFile(file.abs, "split")),
    );
    menu.addSeparator();
    menu.addItem((i) => i.setTitle("Make a copy").setIcon("copy").onClick(() => this.copyEntry(file)));
    menu.addSeparator();
    menu.addItem((i) =>
      i
        .setTitle("Open in default app")
        .setIcon("arrow-up-right")
        .onClick(() => {
          const shell = electronModule<{ openPath(p: string): Promise<string> }>("shell");
          if (shell) void shell.openPath(file.abs);
          else new Notice("Code Workbench: opening externally is unavailable");
        }),
    );
    this.addLocationItems(menu, file.abs, file.rel);
    menu.addSeparator();
    menu.addItem((i) =>
      i
        .setTitle("Diff against last commit")
        .setIcon("git-compare")
        .onClick(() => this.host.openWorkingDiffAbs(file.abs, name)),
    );
    menu.addSeparator();
    menu.addItem((i) => i.setTitle("Rename…").setIcon("pencil").onClick(() => this.renameEntry(file)));
    menu.addItem((i) =>
      i.setTitle("Delete").setIcon("trash").setWarning(true).onClick(() => this.deleteEntry(file)),
    );
    menu.showAtMouseEvent(evt);
  }

  // Right-click a folder: reveal and copy path (rename/delete of a synthetic folder is out of scope).
  private showFolderMenu(evt: MouseEvent, folder: TreeFolder): void {
    evt.preventDefault();
    const base = vaultBasePath(this.app);
    const abs = base ? base.replace(/[\\/]+$/, "") + "/" + folder.path : folder.path;
    const menu = new Menu();
    this.addLocationItems(menu, abs, folder.path);
    menu.showAtMouseEvent(evt);
  }

  // Reveal-in-system-explorer and copy-path items, shared by the file and folder menus. Two copy items
  // (vault-relative and absolute) since the typings here have no Menu submenu, unlike core Obsidian.
  private addLocationItems(menu: Menu, abs: string, rel: string): void {
    menu.addItem((i) =>
      i
        .setTitle("Show in system explorer")
        .setIcon("folder-open")
        .onClick(() => {
          const shell = electronModule<{ showItemInFolder(p: string): void }>("shell");
          if (shell) shell.showItemInFolder(abs);
          else new Notice("Code Workbench: system explorer unavailable");
        }),
    );
    menu.addItem((i) => i.setTitle("Copy vault path").setIcon("copy").onClick(() => this.copyText(rel)));
    menu.addItem((i) => i.setTitle("Copy absolute path").setIcon("copy").onClick(() => this.copyText(abs)));
  }

  private copyText(text: string): void {
    const clip = electronModule<{ writeText(s: string): void }>("clipboard");
    if (clip) {
      clip.writeText(text);
      new Notice("Code Workbench: path copied");
    } else {
      new Notice("Code Workbench: clipboard unavailable");
    }
  }

  // Duplicate a hidden file next to itself ("<name> copy.<ext>", numbered if taken).
  private copyEntry(file: HiddenEntry): void {
    const adapter = this.app.vault.adapter;
    const slash = file.rel.lastIndexOf("/");
    const dir = slash === -1 ? "" : file.rel.slice(0, slash + 1);
    const base = path.basename(file.rel);
    const dot = base.lastIndexOf(".");
    const stem = dot <= 0 ? base : base.slice(0, dot);
    const ext = dot <= 0 ? "" : base.slice(dot);
    void (async () => {
      try {
        let target = `${dir}${stem} copy${ext}`;
        for (let n = 1; await adapter.exists(target); n++) target = `${dir}${stem} copy ${n}${ext}`;
        await adapter.copy(file.rel, target);
        new Notice(`Code Workbench: copied to ${path.basename(target)}`);
        this.afterFsChange();
      } catch (e) {
        error("hidden file copy failed", e);
        new Notice("Code Workbench: copy failed");
      }
    })();
  }

  private renameEntry(file: HiddenEntry): void {
    new RenameModal(this.app, path.basename(file.rel), (newName) => {
      const slash = file.rel.lastIndexOf("/");
      const newRel = (slash === -1 ? "" : file.rel.slice(0, slash + 1)) + newName;
      this.app.vault.adapter
        .rename(file.rel, newRel)
        .then(() => {
          new Notice(`Code Workbench: renamed to ${newName}`);
          this.afterFsChange();
        })
        .catch((e) => {
          error("hidden file rename failed", e);
          new Notice("Code Workbench: rename failed");
        });
    }).open();
  }

  private deleteEntry(file: HiddenEntry): void {
    const name = path.basename(file.rel);
    new ConfirmModal(this.app, "Delete hidden file", `Move "${name}" to the trash?`, "Delete", () => {
      const adapter = this.app.vault.adapter;
      adapter
        .trashSystem(file.rel)
        .then((ok) => (ok ? undefined : adapter.trashLocal(file.rel)))
        .then(() => {
          new Notice(`Code Workbench: deleted ${name}`);
          this.afterFsChange();
        })
        .catch((e) => {
          error("hidden file delete failed", e);
          new Notice("Code Workbench: delete failed");
        });
    }).open();
  }

  // After a rename/delete: rescan the tree and re-read git status (dot-file changes fire no vault event).
  private afterFsChange(): void {
    void this.refresh();
    void this.host.getGitDecorations()?.update();
  }

  // Fetch the Material SVG (cached) and paint it as the node's background-image, exactly like the
  // explorer decorator does, so icons match.
  private async paintIcon(span: HTMLElement, name: string): Promise<void> {
    const cached = this.iconUrls.get(name);
    if (cached !== undefined) {
      span.setCssStyles({ backgroundImage: cached ? `url("${cached}")` : "" });
      return;
    }
    const loader = this.host.getIconLoader();
    if (!loader) return;
    const svg = await loader.load(name);
    if (!svg) {
      // Don't memoize a failed load (e.g. offline first use): leave it uncached so a later refresh
      // retries the download, matching IconLoader's own retry behavior.
      span.setCssStyles({ backgroundImage: "" });
      return;
    }
    const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    this.iconUrls.set(name, url);
    span.setCssStyles({ backgroundImage: `url("${url}")` });
  }
}
