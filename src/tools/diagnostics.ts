import { McpResult } from "../protocol/mcp";

// §7.5: no LSP — always an empty content array (special form, not the §6.5 wrapper).
// Code understanding is Claude's responsibility, not the plugin's.
export function getDiagnostics(): McpResult {
  return { content: [] };
}
