// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { IdeContext } from "../context";
import { McpResult } from "../protocol/mcp";
import { ERROR_CODES, RpcError } from "../protocol/errors";
import { getDiagnostics } from "./diagnostics";
import { getWorkspaceFolders } from "./workspace";
import { getCurrentSelection, getLatestSelection } from "./selection";
import { checkDocumentDirty, getOpenEditors, saveDocument } from "./editors";
import { openFile } from "./open-file";
import { closeAllDiffTabs, closeTab, openDiff } from "./open-diff";

export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: IdeContext,
  signal: AbortSignal,
) => McpResult | Promise<McpResult>;

export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const SCHEMA = "http://json-schema.org/draft-07/schema#";
const noArgs = (): Record<string, unknown> => ({ type: "object", additionalProperties: false, $schema: SCHEMA });
const withProps = (properties: Record<string, unknown>, required?: string[]): Record<string, unknown> => ({
  type: "object",
  properties,
  ...(required ? { required } : {}),
  $schema: SCHEMA,
});

// Catalog published in tools/list (§7). Names + descriptions verbatim from the reference.
// close_tab is handled for compatibility but intentionally not published.
export const TOOL_DESCRIPTORS: ToolDescriptor[] = [
  { name: "getCurrentSelection", description: "Get the current text selection in the editor", inputSchema: noArgs() },
  { name: "getLatestSelection", description: "Get the most recent text selection (even if not in the active editor)", inputSchema: noArgs() },
  { name: "getWorkspaceFolders", description: "Get all workspace folders currently open in the IDE", inputSchema: noArgs() },
  { name: "getOpenEditors", description: "Get list of currently open files", inputSchema: noArgs() },
  { name: "getDiagnostics", description: "Get language diagnostics (errors, warnings) from the editor", inputSchema: withProps({ uri: { type: "string" } }) },
  { name: "checkDocumentDirty", description: "Check if a document has unsaved changes (is dirty)", inputSchema: withProps({ filePath: { type: "string" } }, ["filePath"]) },
  { name: "saveDocument", description: "Save a document with unsaved changes", inputSchema: withProps({ filePath: { type: "string" } }, ["filePath"]) },
  {
    name: "openFile",
    description: "Open a file in the editor and optionally select a range of text",
    inputSchema: withProps({
      filePath: { type: "string" },
      preview: { type: "boolean" },
      startLine: { type: "integer" },
      endLine: { type: "integer" },
      startText: { type: "string" },
      endText: { type: "string" },
      makeFrontmost: { type: "boolean" },
    }, ["filePath"]),
  },
  {
    name: "openDiff",
    description: "Open a diff view comparing old file content with new file content",
    inputSchema: withProps({
      old_file_path: { type: "string" },
      new_file_path: { type: "string" },
      new_file_contents: { type: "string" },
      tab_name: { type: "string" },
    }, ["old_file_path", "new_file_contents"]),
  },
  { name: "closeAllDiffTabs", description: "Close all diff tabs in the editor", inputSchema: noArgs() },
];

const HANDLERS: Record<string, ToolHandler> = {
  getCurrentSelection,
  getLatestSelection,
  getWorkspaceFolders,
  getOpenEditors,
  getDiagnostics,
  checkDocumentDirty,
  saveDocument,
  openFile,
  openDiff,
  closeAllDiffTabs,
  close_tab: closeTab,
};

export async function callTool(params: unknown, ctx: IdeContext, signal: AbortSignal): Promise<McpResult> {
  const p = (params ?? {}) as { name?: unknown; arguments?: unknown };
  if (typeof p.name !== "string" || p.name.length === 0) {
    throw new RpcError(ERROR_CODES.INVALID_REQUEST, "missing tool name");
  }
  const handler = Object.prototype.hasOwnProperty.call(HANDLERS, p.name) ? HANDLERS[p.name] : undefined;
  if (!handler) {
    throw new RpcError(ERROR_CODES.METHOD_NOT_FOUND, `Tool not found: ${p.name}`);
  }
  const args = p.arguments && typeof p.arguments === "object" ? (p.arguments as Record<string, unknown>) : {};
  return handler(args, ctx, signal);
}
