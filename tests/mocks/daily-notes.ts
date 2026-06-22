// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Stand-in for obsidian-daily-notes-interface. Mutable __state lets a test toggle the plugin on and
// hand back a fixed note; default is "not configured" so unrelated tests stay quiet.
import type { TFile } from "obsidian";

export const __state: { loaded: boolean; notes: Record<string, TFile>; resolved: TFile | null } = {
  loaded: false,
  notes: {},
  resolved: null,
};

export function appHasDailyNotesPluginLoaded(): boolean {
  return __state.loaded;
}

export function getAllDailyNotes(): Record<string, TFile> {
  return __state.notes;
}

export function getDailyNote(_date: unknown, _all: Record<string, TFile>): TFile | null {
  return __state.resolved;
}
