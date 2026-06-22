// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { ERROR_CODES, RpcError } from "../protocol/errors";
import { RegisteredTool, ToolDescriptor, ToolResult, VaultToolContext } from "./types";

// Server `instructions` returned in initialize — reaches the model each turn (verified channel).
// Steers it toward the vault tools and away from shelling out, especially for link-safe writes.
// Verbatim from contracts/transport.md.
export const INSTRUCTIONS =
  "Obsidian vault tools for the current vault. READS — use them for what plain file access can't give " +
  "you: they use Obsidian's own link resolver and live cache, so backlinks, wikilink resolution, and " +
  "frontmatter are accurate and current. Use `getBacklinks`/`getOutgoingLinks`/`resolveWikilink` to " +
  "traverse the link graph (don't parse `[[links]]` by hand); `getFrontmatter`; `getActiveNoteContent`; " +
  "`searchVault` to find notes by title/heading/tag/frontmatter; `listFilesInFolder`/`getDailyNote`. " +
  "For full text inside note bodies, ripgrep/your own file search is fine — these tools don't index " +
  "bodies. WRITES — to maintain notes use " +
  "`createNote`/`appendToNote`/`updateFrontmatter`, and ALWAYS `renameNote` (not shell `mv`) and " +
  "`deleteNote` (not shell `rm`): they go through Obsidian, so a rename updates every inbound `[[link]]` " +
  "and a delete is recoverable from trash — shell `mv`/`rm` break links and aren't recoverable. Each " +
  "write is shown to the user for approval before it applies. To rewrite a whole note body, use the " +
  "editor diff flow, not these tools.";

// Aggregates tools registered additively by independent groups (read, write). Each group calls
// register() with its own tools, so the groups never share a file or cross-couple.
export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  register(tools: RegisteredTool[]): void {
    for (const tool of tools) this.tools.set(tool.descriptor.name, tool);
  }

  descriptors(): ToolDescriptor[] {
    return [...this.tools.values()].map((t) => t.descriptor);
  }

  async call(
    name: string,
    args: Record<string, unknown>,
    ctx: VaultToolContext,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new RpcError(ERROR_CODES.METHOD_NOT_FOUND, `Tool not found: ${name}`);
    }
    return tool.handler(args, ctx, signal);
  }
}
