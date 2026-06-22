// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { ToolRegistry } from "../registry";
import { noArgsSchema, objectSchema, RegisteredTool } from "../types";
import { getActiveNoteContent } from "./get-active-note-content";
import { getBacklinks } from "./get-backlinks";
import { getDailyNote } from "./get-daily-note";
import { getFrontmatter } from "./get-frontmatter";
import { getOutgoingLinks } from "./get-outgoing-links";
import { listFilesInFolder } from "./list-files-in-folder";
import { resolveWikilink } from "./resolve-wikilink";
import { searchVault } from "./search-vault";

const pathArg = objectSchema({ path: { type: "string" } }, ["path"]);

// The 8 read tools (contracts/tools.md). Descriptions are written to persuade the model to use them
// instead of grepping. Registered additively so this group never shares a file with the write group.
const READ_TOOLS: RegisteredTool[] = [
  {
    descriptor: {
      name: "getActiveNoteContent",
      description: "Read the note currently open in Obsidian (including unsaved edits in the active editor).",
      inputSchema: noArgsSchema(),
    },
    handler: getActiveNoteContent,
  },
  {
    descriptor: {
      name: "getBacklinks",
      description:
        "List the notes that link to a note, using Obsidian's resolved link graph. Prefer this over grepping for `[[name]]`.",
      inputSchema: pathArg,
    },
    handler: getBacklinks,
  },
  {
    descriptor: {
      name: "getOutgoingLinks",
      description:
        "List the links a note points to (wikilinks, embeds, frontmatter links), each resolved to its target path.",
      inputSchema: pathArg,
    },
    handler: getOutgoingLinks,
  },
  {
    descriptor: {
      name: "resolveWikilink",
      description:
        "Resolve a wikilink (e.g. `Note#Heading|Alias`) to the target note path using Obsidian's resolver; lists candidates when ambiguous.",
      inputSchema: objectSchema(
        { linkpath: { type: "string" }, fromPath: { type: "string" } },
        ["linkpath"],
      ),
    },
    handler: resolveWikilink,
  },
  {
    descriptor: {
      name: "getFrontmatter",
      description: "Read the YAML frontmatter of a note as a structured object.",
      inputSchema: pathArg,
    },
    handler: getFrontmatter,
  },
  {
    descriptor: {
      name: "searchVault",
      description:
        "Search note titles, headings, tags, and frontmatter (ranked, fast). For full text inside note bodies, use ripgrep/file search instead.",
      inputSchema: objectSchema(
        { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 100 } },
        ["query"],
      ),
    },
    handler: searchVault,
  },
  {
    descriptor: {
      name: "listFilesInFolder",
      description: 'List the files and subfolders directly inside a vault folder. Pass "" or "/" for the vault root.',
      inputSchema: objectSchema({ folder: { type: "string" } }, ["folder"]),
    },
    handler: listFilesInFolder,
  },
  {
    descriptor: {
      name: "getDailyNote",
      description:
        "Read the daily note for today or a given ISO date (read-only). Honors the Daily Notes and Periodic Notes plugins.",
      inputSchema: objectSchema({ date: { type: "string" } }),
    },
    handler: getDailyNote,
  },
];

// Additive registration: read tools join the shared registry without touching the write group.
export function registerReadTools(registry: ToolRegistry): void {
  registry.register(READ_TOOLS);
}
