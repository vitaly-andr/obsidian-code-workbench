// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { App, FuzzySuggestModal } from "obsidian";
import type { LaunchProfile } from "../util/launch-profiles";

// Palette picker for the "Launch agent profile…" command. Selection routes through the
// injected callback (the plugin's single launchProfile entry point).
export class LaunchProfileModal extends FuzzySuggestModal<LaunchProfile> {
  constructor(
    app: App,
    private readonly profiles: LaunchProfile[],
    private readonly onPick: (profile: LaunchProfile) => void,
  ) {
    super(app);
    this.setPlaceholder("Launch agent profile…");
  }

  getItems(): LaunchProfile[] {
    return this.profiles;
  }

  getItemText(profile: LaunchProfile): string {
    return profile.name || profile.command || profile.id;
  }

  onChooseItem(profile: LaunchProfile): void {
    this.onPick(profile);
  }
}
