// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import * as path from "path";
import { ItemView, setIcon, WorkspaceLeaf } from "obsidian";
import type { IconLoader } from "../icons/icon-loader";
import { fileIconName, folderIconName } from "../icons/icon-names";
import { buildHiddenTree, HiddenEntry, TreeFolder } from "./hidden-files";
import { HIDDEN_TREE_VIEW_TYPE } from "./view-types";

// What the panel needs from the plugin, kept narrow to avoid a plugin <-> view import cycle.
export interface HiddenFilesHost {
  listHiddenFiles(): Promise<HiddenEntry[]>;
  openHiddenFile(abs: string): void | Promise<void>;
  getIconLoader(): IconLoader | null;
  fileIconsEnabled(): boolean;
}

// A sidebar explorer for the vault's hidden (dot) files, rendered as a collapsible tree using
// Obsidian's own nav/tree CSS classes so it matches the file explorer (indentation, hovers, theme).
// Folders start collapsed; clicking a file opens it in the editable hidden-file view. When the
// "File type icons" setting is on, nodes show the same Material icons as the explorer.
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

    const chevron = self.createDiv({ cls: "cw-tree-chevron" });
    setIcon(chevron, "chevron-right");

    let iconSpan: HTMLElement | null = null;
    if (this.host.fileIconsEnabled()) {
      iconSpan = self.createSpan({ cls: "cw-nav-icon" });
      void this.paintIcon(iconSpan, folderIconName(folder.path, expanded, this.app.vault.configDir));
    }
    self.createDiv({ cls: "tree-item-inner nav-folder-title-content", text: folder.name });

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
    if (this.host.fileIconsEnabled()) {
      const iconSpan = self.createSpan({ cls: "cw-nav-icon" });
      void this.paintIcon(iconSpan, fileIconName(file.rel));
    }
    self.createDiv({ cls: "tree-item-inner nav-file-title-content", text: path.basename(file.rel) });
    self.addEventListener("click", () => void this.host.openHiddenFile(file.abs));
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
