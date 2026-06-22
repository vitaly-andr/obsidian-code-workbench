// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import type { App } from "obsidian";

// A tool as published in tools/list.
export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// One tools/call result: a single text block whose text is JSON, plus the MCP isError flag.
export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

// Result of a mutation (data-model "WriteOutcome"); serialized into a ToolResult.
export interface WriteOutcome {
  applied?: boolean;
  cancelled?: boolean;
  error?: string;
  [key: string]: unknown;
}

// Approval surface (implemented by src/vault-tools/approval.ts). Declared here so the
// tool context can reference it without a types <-> approval import cycle.
export interface Approval {
  // Content writes (create/append/frontmatter): show a diff/preview and return Keep + the
  // possibly-edited content. `oldPath` is the vault-relative file the diff bases on (missing -> empty).
  reviewContent(
    opts: { path: string; oldContent: string; newContent: string; tabName: string },
    signal: AbortSignal,
  ): Promise<{ approved: boolean; finalContent: string }>;
  // Rename/delete: a yes/no confirmation modal.
  confirm(opts: { title: string; message: string; cta: string; destructive?: boolean }): Promise<boolean>;
}

// Shared handles passed to every vault-tool handler.
export interface VaultToolContext {
  app: App;
  approval: Approval;
  // True once metadataCache has emitted `resolved` — link maps are trustworthy only after that.
  isIndexed: () => boolean;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: VaultToolContext,
  signal: AbortSignal,
) => Promise<ToolResult>;

export interface RegisteredTool {
  descriptor: ToolDescriptor;
  handler: ToolHandler;
}

// Most tools succeed with a JSON payload in one text block.
export function ok(payload: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

// Tool-level failure: structured { error } + isError (not a JSON-RPC error).
export function fail(error: string): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify({ error }) }], isError: true };
}

const SCHEMA = "http://json-schema.org/draft-07/schema#";

export function noArgsSchema(): Record<string, unknown> {
  return { type: "object", properties: {}, additionalProperties: false, $schema: SCHEMA };
}

export function objectSchema(
  properties: Record<string, unknown>,
  required?: string[],
): Record<string, unknown> {
  return {
    type: "object",
    properties,
    ...(required ? { required } : {}),
    $schema: SCHEMA,
  };
}
