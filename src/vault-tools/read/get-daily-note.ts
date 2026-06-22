// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { moment, TFile } from "obsidian";
import {
  appHasDailyNotesPluginLoaded,
  getAllDailyNotes,
  getDailyNote as resolveDailyNote,
} from "obsidian-daily-notes-interface";
import { fail, ok, ToolHandler } from "../types";

// obsidian types `moment` as a namespace; at runtime it is the callable moment factory. Derive the
// date type from the interface's own signature so we don't depend on the `moment` types resolving.
type MomentDate = Parameters<typeof resolveDailyNote>[0] & { isValid(): boolean };
const makeMoment = moment as unknown as (input?: string, format?: string, strict?: boolean) => MomentDate;

// The daily note for today (or an ISO `date`). Read-only — does not create. Honors both the core
// Daily Notes plugin and Periodic Notes via the daily-notes-interface; reports clearly when neither
// is configured. Returns exists:false (no path) when the note for that date hasn't been created.
export const getDailyNote: ToolHandler = async (args, ctx) => {
  if (!appHasDailyNotesPluginLoaded()) return fail("daily notes not configured");

  // Strict parse (3rd arg) so an overflow/garbage date is rejected, not rolled over to another note.
  const date =
    typeof args.date === "string" && args.date.length > 0
      ? makeMoment(args.date, "YYYY-MM-DD", true)
      : makeMoment();
  if (!date.isValid()) return fail("invalid date");

  let all: Record<string, TFile>;
  try {
    all = getAllDailyNotes();
  } catch {
    return fail("daily notes not configured");
  }

  const note = resolveDailyNote(date, all);
  if (!note) return ok({ exists: false });

  const content = await ctx.app.vault.cachedRead(note);
  return ok({ path: note.path, content, exists: true });
};
