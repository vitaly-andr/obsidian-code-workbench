// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Paints Material file/folder icons onto the file-explorer rows. For each row we resolve an icon
// name from its path (exact filename, then longest extension, then a default; folders by name, with
// an "-open" variant when expanded), then set it as a CSS background-image (a data: URL) on a small
// injected span — no SVG markup is inserted into the tree. SVGs arrive asynchronously from the
// IconLoader; when one lands every visible row using that icon is repainted. A MutationObserver
// re-decorates on virtual scroll, folder expand/collapse, and renames.
import { App } from "obsidian";
import { BY_EXT, BY_FOLDER, BY_NAME, DEFAULT_FILE, DEFAULT_FOLDER } from "../icon-map";
import type { IconLoader } from "./icon-loader";

const ICON_CLASS = "cw-nav-icon";
const NAME_ATTR = "data-cw-icon";
const EXPLORER = '.workspace-leaf-content[data-type="file-explorer"]';

export class ExplorerIcons {
  // iconName -> background-image value: a data: URL, or "" once we know the SVG is unavailable.
  private readonly urls = new Map<string, string>();
  private observer: MutationObserver | null = null;
  private container: HTMLElement | null = null;
  private rafQueued = false;

  constructor(
    private readonly app: App,
    private readonly loader: IconLoader,
  ) {}

  enable(): void {
    // Pre-warm the defaults so the common rows paint on the first pass without a flash.
    for (const n of [DEFAULT_FILE, DEFAULT_FOLDER, `${DEFAULT_FOLDER}-open`]) void this.fetch(n);
    this.attach();
  }

  disable(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.container = null;
    document.querySelectorAll<HTMLElement>(`.${ICON_CLASS}`).forEach((el) => el.remove());
    document
      .querySelectorAll<HTMLElement>(`[${NAME_ATTR}]`)
      .forEach((el) => el.removeAttribute(NAME_ATTR));
  }

  // (Re)locate the explorer and repaint. Safe to call repeatedly — on layout changes and vault
  // create/rename/delete events the explorer leaf may have been rebuilt.
  refresh(): void {
    this.attach();
  }

  private attach(): void {
    const container = document.querySelector<HTMLElement>(EXPLORER);
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
    const name = isFolder ? this.folderIcon(path, el) : this.fileIcon(path);
    if (el.getAttribute(NAME_ATTR) === name) return; // already showing the right icon
    el.setAttribute(NAME_ATTR, name);

    let span = el.querySelector<HTMLElement>(`:scope > .${ICON_CLASS}`);
    if (!span) {
      span = document.createElement("span");
      span.className = ICON_CLASS;
      // Place the icon just before the label — after the folder's collapse chevron, if any.
      const content = el.querySelector(
        ":scope > .tree-item-inner, :scope > .nav-file-title-content, :scope > .nav-folder-title-content",
      );
      el.insertBefore(span, content ?? null);
    }
    this.paint(span, name);
  }

  private paint(span: HTMLElement, name: string): void {
    const url = this.urls.get(name);
    if (url !== undefined) {
      span.setCssStyles({ backgroundImage: url ? `url("${url}")` : "" });
      return;
    }
    span.setCssStyles({ backgroundImage: "" });
    void this.fetch(name);
  }

  // Fetch the SVG, turn it into a data: URL, and repaint every visible row that uses this icon.
  private async fetch(name: string): Promise<void> {
    if (this.urls.has(name)) return;
    const svg = await this.loader.load(name);
    const url = svg ? `data:image/svg+xml,${encodeURIComponent(svg)}` : "";
    this.urls.set(name, url);
    if (!url || !this.container) return;
    const sel = `[${NAME_ATTR}="${name}"] > .${ICON_CLASS}`;
    this.container.querySelectorAll<HTMLElement>(sel).forEach((span) => {
      span.setCssStyles({ backgroundImage: `url("${url}")` });
    });
  }

  private fileIcon(path: string): string {
    const base = (path.split("/").pop() ?? path).toLowerCase();
    if (BY_NAME[base]) return BY_NAME[base];
    // Try the longest extension first: foo.schema.json -> "schema.json" before "json".
    const parts = base.split(".");
    for (let i = 1; i < parts.length; i++) {
      const ext = parts.slice(i).join(".");
      if (BY_EXT[ext]) return BY_EXT[ext];
    }
    return DEFAULT_FILE;
  }

  private folderIcon(path: string, el: HTMLElement): string {
    const base = (path.split("/").pop() ?? path).toLowerCase();
    const name = BY_FOLDER[base] ?? DEFAULT_FOLDER;
    // The "-open" variant (folder-src-open, folder-open, …) is derived, never stored in the map.
    const collapsed = el.closest(".nav-folder")?.classList.contains("is-collapsed") ?? false;
    return collapsed ? name : `${name}-open`;
  }
}
