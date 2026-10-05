// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { describe, expect, it } from "vitest";
import {
  applyPreset,
  BACKEND_PRESETS,
  generateBackendScript,
  seedBackendConfig,
  sessionContextTokens,
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

  // Z.ai serves glm-5.3 and glm-5.3-flash on the plan (docs.z.ai/devpack/overview). Flash is the
  // cheap default on every tier; fable gets the full model.
  it("pins the GLM preset to Flash, with the full GLM-5.3 on fable", () => {
    const glm = BACKEND_PRESETS.glm;
    expect(glm.baseUrl).toBe("https://api.z.ai/api/anthropic");
    expect(glm.defaultStartupModel).toBe("glm-5.3-flash");
    expect(glm.defaultModel).toBe("glm-5.3-flash");
    expect(glm.defaultOpusModel).toBe("glm-5.3-flash");
    expect(glm.defaultHaikuModel).toBe("glm-5.3-flash");
    expect(glm.defaultFableModel).toBe("glm-5.3");
  });

  it("moves a config written by an older release onto the current mapping, keeping the key", () => {
    const old = {
      name: "Claude × GLM",
      baseUrl: "https://api.z.ai/api/anthropic",
      authToken: "zai-key",
      startupModel: "glm-5.2",
      model: "glm-5.2",
      fableModel: "glm-5.2",
      opusModel: "glm-5.2",
      haikuModel: "glm-4.7",
      models: {},
    };
    const cfg = applyPreset(old, BACKEND_PRESETS.glm);
    expect(cfg).toEqual({ ...seedBackendConfig(BACKEND_PRESETS.glm), name: "Claude × GLM", authToken: "zai-key" });
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
    expect(script).toContain("export ANTHROPIC_MODEL='glm-5.3-flash'");
    expect(script).toContain("export ANTHROPIC_DEFAULT_FABLE_MODEL='glm-5.3'");
    expect(script).toContain("export ANTHROPIC_DEFAULT_OPUS_MODEL='glm-5.3-flash'");
    expect(script).toContain("export ANTHROPIC_DEFAULT_SONNET_MODEL='glm-5.3-flash'");
    expect(script).toContain("export ANTHROPIC_DEFAULT_HAIKU_MODEL='glm-5.3-flash'");
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

  // Claude Code assumes 200K for an id it doesn't know; GLM's tiers are all 1M, so the script
  // says so. Kimi mixes 256K tiers with `k3[1m]`, where no single number is right.
  it("declares the context window only when every tier shares one", () => {
    expect(sessionContextTokens(seedBackendConfig(BACKEND_PRESETS.glm))).toBe(1_000_000);
    expect(generateBackendScript(seedBackendConfig(BACKEND_PRESETS.glm))).toContain(
      "export CLAUDE_CODE_MAX_CONTEXT_TOKENS=1000000\n",
    );
    expect(sessionContextTokens(seedBackendConfig(BACKEND_PRESETS.kimi))).toBeNull();
    expect(generateBackendScript(seedBackendConfig(BACKEND_PRESETS.kimi))).not.toContain(
      "CLAUDE_CODE_MAX_CONTEXT_TOKENS",
    );
  });

  it("quotes a key containing a single quote so the shell can't break out of it", () => {
    const cfg = seedBackendConfig(BACKEND_PRESETS.glm);
    cfg.authToken = "a'b; rm -rf /";
    expect(generateBackendScript(cfg)).toContain(
      `export ANTHROPIC_AUTH_TOKEN='a'\\''b; rm -rf /'`,
    );
  });
});
