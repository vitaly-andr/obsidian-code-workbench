// Minimal stand-in for the Obsidian API used at module load by the tested graph.
export class FileSystemAdapter {
  getBasePath(): string {
    return "/vault";
  }
}
export class MarkdownView {}
export class TextFileView {}
export class ItemView {}
export class TFile {}
export class WorkspaceLeaf {}
export class Plugin {}
export class Notice {
  constructor(_message?: string) {}
}
export class App {}
