// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { describe, expect, it } from "vitest";
import {
  BACKEND_PRESETS,
  generateBackendScript,
  seedBackendConfig,
} from "../../src/util/agent-backends";

const presets = Object.values(BACKEND_PRESETS);

describe("backend presets", () => {
  it("keys each preset by its own id and gives it a console URL", () => {
    for (const [key, preset] of Object.entries(BACKEND_PRESETS)) {
      expect(preset.id).toBe(key);
      expect(preset.baseUrl).toMatch(/^https:\/\//);
      expect(preset.consoleUrl).toMatch(/^https:\/\//);
      expect(preset.consoleName).not.toBe("");
      expect(preset.tagline).not.toBe("");
    }
  });

  it("maps every tier to a model the preset lists, so the tier table has a name to show", () => {
    for (const preset of presets) {
      const tiers = [
        preset.defaultStartupModel,
        preset.defaultModel,
        preset.defaultFableModel,
        preset.defaultOpusModel,
        preset.defaultHaikuModel,
      ];
      for (const model of tiers) expect(preset.models[model]).toBeDefined();
    }
  });

  // Z.ai's own Claude Code setup (docs.z.ai/devpack/tool/claude): haiku on glm-4.7, sonnet and
  // opus on glm-5.2. Fable is not in their docs and follows opus.
  it("pins the GLM preset to the mapping Z.ai documents", () => {
    const glm = BACKEND_PRESETS.glm;
    expect(glm.baseUrl).toBe("https://api.z.ai/api/anthropic");
    expect(glm.defaultHaikuModel).toBe("glm-4.7");
    expect(glm.defaultModel).toBe("glm-5.2");
    expect(glm.defaultOpusModel).toBe("glm-5.2");
    expect(glm.defaultFableModel).toBe("glm-5.2");
    expect(glm.defaultStartupModel).toBe("glm-5.2");
  });
});

describe("generateBackendScript", () => {
  it("exports the endpoint, the key and every model tier", () => {
    const cfg = seedBackendConfig(BACKEND_PRESETS.glm);
    cfg.authToken = "zai-key";
    const script = generateBackendScript(cfg);

    expect(script.startsWith("#!/bin/sh\n")).toBe(true);
    expect(script).toContain("unset ANTHROPIC_API_KEY");
    expect(script).toContain("export ANTHROPIC_BASE_URL='https://api.z.ai/api/anthropic'");
    expect(script).toContain("export ANTHROPIC_AUTH_TOKEN='zai-key'");
    expect(script).toContain("export ANTHROPIC_MODEL='glm-5.2'");
    expect(script).toContain("export ANTHROPIC_DEFAULT_FABLE_MODEL='glm-5.2'");
    expect(script).toContain("export ANTHROPIC_DEFAULT_OPUS_MODEL='glm-5.2'");
    expect(script).toContain("export ANTHROPIC_DEFAULT_SONNET_MODEL='glm-5.2'");
    expect(script).toContain("export ANTHROPIC_DEFAULT_HAIKU_MODEL='glm-4.7'");
    expect(script.trimEnd().endsWith('exec claude "$@"')).toBe(true);
  });

  it("falls back to the main model for tiers a config leaves unset", () => {
    const cfg = seedBackendConfig(BACKEND_PRESETS.kimi);
    delete cfg.fableModel;
    delete cfg.opusModel;
    delete cfg.haikuModel;
    const script = generateBackendScript(cfg);

    for (const tier of ["FABLE", "OPUS", "SONNET", "HAIKU"]) {
      expect(script).toContain(`export ANTHROPIC_DEFAULT_${tier}_MODEL='${cfg.model}'`);
    }
  });

  it("quotes a key containing a single quote so the shell can't break out of it", () => {
    const cfg = seedBackendConfig(BACKEND_PRESETS.glm);
    cfg.authToken = "a'b; rm -rf /";
    expect(generateBackendScript(cfg)).toContain(
      `export ANTHROPIC_AUTH_TOKEN='a'\\''b; rm -rf /'`,
    );
  });
});
