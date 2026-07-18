// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Launch profiles: named terminal commands the status bar / palette launcher can start in the
// vault folder. The seeded "Claude" profile preserves the original behavior; users add their
// own wrappers (e.g. a script exporting an alternative backend's env). A profile is a command
// only — secrets never live in plugin settings.

// A profile is either a plain terminal command, or a managed backend: `backend` present marks
// it managed, and its launch command is a generated wrapper script (the API key lives in the
// backend's 0600 JSON, never here in plugin settings).
export interface ManagedBackendRef {
  presetId: string;
  model: string;
}

export interface LaunchProfile {
  id: string;
  name: string;
  command: string;
  backend?: ManagedBackendRef;
}

export interface LaunchProfilesState {
  profiles: LaunchProfile[];
  defaultId: string;
}

export const CLAUDE_PROFILE: LaunchProfile = { id: "claude", name: "Claude", command: "claude" };

// Bring persisted settings to a usable state: drop malformed rows and duplicate ids, seed the
// built-in Claude profile when the list is missing or ends up empty, and repoint a dangling
// default at the first entry. Total: accepts any persisted junk, never throws.
export function normalizeLaunchProfiles(profiles: unknown, defaultId: unknown): LaunchProfilesState {
  const list: LaunchProfile[] = [];
  if (Array.isArray(profiles)) {
    for (const entry of profiles) {
      if (!entry || typeof entry !== "object") continue;
      const { id, name, command, backend } = entry as Partial<LaunchProfile>;
      if (typeof id !== "string" || id === "") continue;
      if (typeof name !== "string" || typeof command !== "string") continue;
      if (list.some((p) => p.id === id)) continue;
      const profile: LaunchProfile = { id, name, command };
      if (
        backend &&
        typeof backend === "object" &&
        typeof backend.presetId === "string" &&
        typeof backend.model === "string"
      ) {
        profile.backend = { presetId: backend.presetId, model: backend.model };
      }
      list.push(profile);
    }
  }
  if (list.length === 0) list.push({ ...CLAUDE_PROFILE });
  const def =
    typeof defaultId === "string" && list.some((p) => p.id === defaultId) ? defaultId : list[0].id;
  return { profiles: list, defaultId: def };
}

export function defaultLaunchProfile(state: LaunchProfilesState): LaunchProfile {
  return state.profiles.find((p) => p.id === state.defaultId) ?? state.profiles[0];
}

// A fresh unique id for a user-added profile ("profile-2", "profile-3", …).
export function newLaunchProfileId(existing: LaunchProfile[]): string {
  let n = existing.length + 1;
  while (existing.some((p) => p.id === `profile-${n}`)) n++;
  return `profile-${n}`;
}
