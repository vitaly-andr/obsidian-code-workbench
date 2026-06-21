// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Lazily downloads, caches, and serves Material icon SVGs. On first use of an icon name the SVG is
// fetched via Obsidian's requestUrl (no CORS) from jsDelivr and written to the plugin's data folder;
// subsequent reads come from the cache and need no network. Each name is loaded at most once per
// session (memoized promise). Same pattern as the tree-sitter grammar loader.
import { DataAdapter, requestUrl } from "obsidian";
import { ICON_CDN, ICONS_VERSION } from "../icon-map";
import { warn } from "../util/log";

export class IconLoader {
  private readonly cache = new Map<string, Promise<string | null>>();

  constructor(
    private readonly adapter: DataAdapter,
    private readonly cacheDir: string,
  ) {}

  // Resolves to the raw SVG markup, or null when the icon is unavailable (offline first use, 404).
  load(name: string): Promise<string | null> {
    let pending = this.cache.get(name);
    if (!pending) {
      pending = this.doLoad(name)
        .catch((e) => {
          warn(`icons: "${name}" failed to load: ${String(e)}`);
          return null;
        })
        .then((svg) => {
          // Don't memoize failures (e.g. offline on first use): drop the entry so a later attempt
          // retries the download once back online. Successful loads stay cached for the session.
          if (!svg) this.cache.delete(name);
          return svg;
        });
      this.cache.set(name, pending);
    }
    return pending;
  }

  private async doLoad(name: string): Promise<string | null> {
    // The theme version is part of the filename, so bumping ICONS_VERSION re-downloads instead of
    // serving art from the previous icon set.
    const path = `${this.cacheDir}/${name}.${ICONS_VERSION}.svg`;
    if (await this.adapter.exists(path)) return this.adapter.read(path);
    const res = await requestUrl({ url: `${ICON_CDN}/${name}.svg`, throw: false });
    if (res.status !== 200) return null;
    await this.ensureDir();
    await this.adapter.write(path, res.text);
    return res.text;
  }

  private async ensureDir(): Promise<void> {
    if (!(await this.adapter.exists(this.cacheDir))) {
      try {
        await this.adapter.mkdir(this.cacheDir);
      } catch {
        /* concurrent create — ignore */
      }
    }
  }
}
