import { App, TFile, WorkspaceLeaf } from "obsidian";
import { IdeContext } from "../context";
import { McpResult, wrap } from "../protocol/mcp";
import { languageIdForPath } from "../util/languages";
import { absoluteForVaultPath, toFileUri } from "../util/paths";
import { CODE_VIEW_TYPE } from "../views/view-types";

interface OpenFileLeaf {
  leaf: WorkspaceLeaf;
  file: TFile;
  lineCount: number;
}

function openFileLeaves(app: App): OpenFileLeaf[] {
  const out: OpenFileLeaf[] = [];
  for (const type of ["markdown", CODE_VIEW_TYPE]) {
    for (const leaf of app.workspace.getLeavesOfType(type)) {
      const view = leaf.view as unknown as { file?: TFile; editor?: { lineCount?: () => number } };
      if (!view.file) continue;
      const lineCount = typeof view.editor?.lineCount === "function" ? view.editor.lineCount() : 0;
      out.push({ leaf, file: view.file, lineCount });
    }
  }
  return out;
}

function findOpenByAbsolutePath(app: App, absPath: string): OpenFileLeaf | null {
  for (const entry of openFileLeaves(app)) {
    const abs = absoluteForVaultPath(app, entry.file.path) ?? entry.file.path;
    if (abs === absPath) return entry;
  }
  return null;
}

// §7.4: list open files. Obsidian autosaves, so isDirty is effectively always false.
export function getOpenEditors(_args: Record<string, unknown>, ctx: IdeContext): McpResult {
  const app = ctx.app;
  const active = app.workspace.activeLeaf;
  const tabs = openFileLeaves(app).map(({ leaf, file, lineCount }) => {
    const abs = absoluteForVaultPath(app, file.path) ?? file.path;
    return {
      uri: toFileUri(abs),
      fileName: abs,
      label: file.name,
      languageId: languageIdForPath(file.path),
      isActive: leaf === active,
      isDirty: false,
      isPinned: false,
      isPreview: false,
      isUntitled: false,
      lineCount,
      groupIndex: 0,
      viewColumn: 1,
      isGroupActive: leaf === active,
    };
  });
  return wrap({ tabs });
}

// §7.6
export function checkDocumentDirty(args: Record<string, unknown>, ctx: IdeContext): McpResult {
  const filePath = String(args.filePath ?? "");
  if (!findOpenByAbsolutePath(ctx.app, filePath)) {
    return wrap({ success: false, message: `Document not open: ${filePath}` });
  }
  return wrap({ success: true, filePath, isDirty: false, isUntitled: false });
}

// §7.7
export async function saveDocument(args: Record<string, unknown>, ctx: IdeContext): Promise<McpResult> {
  const filePath = String(args.filePath ?? "");
  const found = findOpenByAbsolutePath(ctx.app, filePath);
  if (!found) {
    return wrap({ success: false, message: `Document not open: ${filePath}` });
  }
  const view = found.leaf.view as unknown as { save?: () => Promise<void> };
  if (typeof view.save === "function") {
    try {
      await view.save();
    } catch {
      // Autosave already persisted; an explicit save failure is non-fatal here.
    }
  }
  return wrap({ success: true, filePath });
}
