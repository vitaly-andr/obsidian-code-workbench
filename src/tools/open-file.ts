import { App, TFile } from "obsidian";
import { IdeContext } from "../context";
import { McpResult, textBlock } from "../protocol/mcp";
import { vaultPathForAbsolute } from "../util/paths";

function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Math.trunc(Number(value));
  return null;
}

// §7.8: open a file, optionally selecting a 1-based line range. Special response
// form — a direct text content block (not the §6.5 wrapper).
export async function openFile(args: Record<string, unknown>, ctx: IdeContext): Promise<McpResult> {
  const app = ctx.app;
  const filePath = String(args.filePath ?? "");
  const rel = vaultPathForAbsolute(app, filePath);
  const file = rel != null ? app.vault.getAbstractFileByPath(rel) : null;

  const startLine = toInt(args.startLine);
  const endLine = toInt(args.endLine);

  if (file instanceof TFile) {
    const leaf = app.workspace.getLeaf(false);
    await leaf.openFile(file);
    if (startLine != null && endLine != null) {
      const editor = (leaf.view as unknown as { editor?: {
        setSelection: (from: { line: number; ch: number }, to: { line: number; ch: number }) => void;
        scrollIntoView: (range: unknown, center?: boolean) => void;
      } }).editor;
      if (editor) {
        const from = { line: Math.max(0, startLine - 1), ch: 0 };
        const to = { line: Math.max(0, endLine), ch: 0 };
        editor.setSelection(from, to);
        editor.scrollIntoView({ from, to }, true);
      }
      return { content: [textBlock(`Opened file and selected lines ${startLine} to ${endLine}`)] };
    }
  }
  return { content: [textBlock(`Opened file: ${filePath}`)] };
}
