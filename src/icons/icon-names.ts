// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Pure icon-name resolution shared by the explorer decorator and the hidden-files tree, so both pick
// the same Material icon for a path.
import { BY_EXT, BY_FOLDER, BY_NAME, DEFAULT_FILE, DEFAULT_FOLDER } from "../icon-map";

// File icon: exact filename first, then the longest matching extension (foo.schema.json -> the
// "schema.json" rule before "json"), else the generic file icon.
export function fileIconName(path: string): string {
  const base = (path.split("/").pop() ?? path).toLowerCase();
  if (BY_NAME[base]) return BY_NAME[base];
  const parts = base.split(".");
  for (let i = 1; i < parts.length; i++) {
    const ext = parts.slice(i).join(".");
    if (BY_EXT[ext]) return BY_EXT[ext];
  }
  return DEFAULT_FILE;
}

// Folder icon by name; `open` selects the derived "-open" variant (never stored in the map).
// `configDir` (Vault#configDir — default ".obsidian", but the user can rename it) gets the Obsidian
// icon without hardcoding the config-folder name in the icon map.
export function folderIconName(path: string, open: boolean, configDir?: string): string {
  const base = (path.split("/").pop() ?? path).toLowerCase();
  let name = BY_FOLDER[base] ?? DEFAULT_FOLDER;
  if (configDir && base === configDir.toLowerCase()) name = "folder-obsidian";
  return open ? `${name}-open` : name;
}
