// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// MCP result shaping and the initialize handshake.

export interface ContentBlock {
  type: "text";
  text: string;
}

export interface McpResult {
  content: ContentBlock[];
}

export function textBlock(text: string): ContentBlock {
  return { type: "text", text };
}

// §6.5: most tools return their payload JSON-stringified inside a single text block.
// (Exceptions — getDiagnostics, openFile, openDiff, closeAllDiffTabs — build content directly.)
export function wrap(payload: unknown): McpResult {
  return { content: [textBlock(JSON.stringify(payload))] };
}

export const MCP_PROTOCOL_VERSION = "2024-11-05";

export function initializeResult(version: string): Record<string, unknown> {
  return {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {
      logging: {},
      prompts: { listChanged: true },
      resources: { subscribe: true, listChanged: true },
      tools: { listChanged: true },
    },
    serverInfo: { name: "obsidian", version },
  };
}
