// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { ToolRegistry } from "../registry";
import { objectSchema, RegisteredTool } from "../types";
import { appendToNote } from "./append-to-note";
import { createNote } from "./create-note";
import { deleteNote } from "./delete-note";
import { renameNote } from "./rename-note";
import { updateFrontmatter } from "./update-frontmatter";

// The 5 write tools (contracts/tools.md). Every one goes through the Obsidian vault API and is
// user-approved before applying. Descriptions steer the model toward these link-safe tools and away
// from shell mv/rm. Registered additively, in its own file — independent of the read group (T022).
const WRITE_TOOLS: RegisteredTool[] = [
  {
    descriptor: {
      name: "createNote",
      description: "Create a new note (shown for approval first). Refuses to overwrite an existing note.",
      inputSchema: objectSchema({ path: { type: "string" }, content: { type: "string" } }, ["path"]),
    },
    handler: createNote,
  },
  {
    descriptor: {
      name: "appendToNote",
      description:
        "Append or prepend text to a note without overwriting its body (shown as a diff for approval).",
      inputSchema: objectSchema(
        {
          path: { type: "string" },
          content: { type: "string" },
          position: { enum: ["append", "prepend"] },
        },
        ["path", "content"],
      ),
    },
    handler: appendToNote,
  },
  {
    descriptor: {
      name: "updateFrontmatter",
      description:
        "Merge fields into a note's YAML frontmatter, leaving the body untouched (shown as a diff for approval).",
      inputSchema: objectSchema(
        { path: { type: "string" }, fields: { type: "object" }, merge: { type: "boolean" } },
        ["path", "fields"],
      ),
    },
    handler: updateFrontmatter,
  },
  {
    descriptor: {
      name: "renameNote",
      description:
        "Rename or move a note through Obsidian so every inbound [[link]] is updated. Use this instead of shell `mv`.",
      inputSchema: objectSchema({ path: { type: "string" }, newPath: { type: "string" } }, ["path", "newPath"]),
    },
    handler: renameNote,
  },
  {
    descriptor: {
      name: "deleteNote",
      description:
        "Delete a note to trash (recoverable) through Obsidian. Use this instead of shell `rm`.",
      inputSchema: objectSchema({ path: { type: "string" } }, ["path"]),
    },
    handler: deleteNote,
  },
];

// Additive registration: write tools join the shared registry without touching the read group.
export function registerWriteTools(registry: ToolRegistry): void {
  registry.register(WRITE_TOOLS);
}
