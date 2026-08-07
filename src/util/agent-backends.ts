// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Managed agent backends: run the Claude Code CLI against an Anthropic-compatible endpoint
// (a Kimi or GLM subscription) without the user hand-writing a wrapper script. A backend is a
// human-readable JSON config (0600, holds the API key) plus a generated shell script (0700)
// that exports the environment and execs `claude`. The key lives ONLY in the 0600 JSON — never
// in the plugin's data.json, so it is not carried by Obsidian Sync or a vault backup.
//
// The `models` map mirrors opencode's provider shape (id -> { name, limit }), so the settings
// UI can show human-readable model names and context sizes.
import { promises as fs } from "fs";
import * as path from "path";

export interface BackendModel {
  name: string;
  contextTokens: number;
  outputTokens: number;
}

export interface BackendPreset {
  id: string;
  name: string;
  baseUrl: string;
  // Where the user creates the subscription API key, and what to call that page in the UI.
  consoleUrl: string;
  consoleName: string;
  // One line for the settings row, before a backend of this preset exists.
  tagline: string;
  defaultStartupModel: string;
  defaultModel: string;
  defaultFableModel: string;
  defaultOpusModel: string;
  defaultHaikuModel: string;
  models: Record<string, BackendModel>;
}

// The on-disk backend config (backends/<id>.json). `authToken` is the secret. `startupModel` is
// the literal ANTHROPIC_MODEL a launched session starts on; `model` is the Sonnet-tier model —
// the two are independent (e.g. the session can start on a standard-speed model while `/model
// sonnet` resolves to a HighSpeed one). `fableModel`/`opusModel`/`haikuModel` are optional
// per-tier overrides (unset => falls back to `model`, i.e. that tier is pinned to Sonnet's model
// — Kimi's own documented default for third-party agents).
export interface BackendConfig {
  name: string;
  baseUrl: string;
  authToken: string;
  startupModel: string;
  model: string;
  fableModel?: string;
  opusModel?: string;
  haikuModel?: string;
  models: Record<string, BackendModel>;
}

// Kimi model ids and context sizes verified against the Kimi Code docs
// (kimi.com/code/docs/en/kimi-code/models) 2026-07-19; K3 released 2026-07-16. `k2.6` is not
// listed: Kimi documents it as an automatic internal fallback when thinking is disabled on
// k3/kimi-for-coding, not a model id selectable through ANTHROPIC_MODEL.
export const BACKEND_PRESETS: Record<string, BackendPreset> = {
  kimi: {
    id: "kimi",
    name: "Kimi",
    baseUrl: "https://api.kimi.com/coding/",
    consoleUrl: "https://www.kimi.com/code/console",
    consoleName: "Kimi Code Console",
    tagline: "Run Claude Code on your Kimi subscription — paste the API key, no script to write.",
    // User-confirmed tier mapping (2026-07-19): session starts on K2.7 standard; fable = K3 1M
    // (hardest/longest tasks); opus = K3 256K (complex reasoning); sonnet = K2.7 HighSpeed (what
    // `/model sonnet` switches to); haiku = K2.7 standard (k2.6 isn't a selectable id here).
    defaultStartupModel: "kimi-for-coding",
    defaultModel: "kimi-for-coding-highspeed",
    defaultFableModel: "k3[1m]",
    defaultOpusModel: "k3",
    defaultHaikuModel: "kimi-for-coding",
    models: {
      "k3[1m]": { name: "Kimi K3 (1M context)", contextTokens: 1_000_000, outputTokens: 32_000 },
      k3: { name: "Kimi K3 (256K context)", contextTokens: 262_144, outputTokens: 32_000 },
      "kimi-for-coding": {
        name: "Kimi for Coding (K2.7)",
        contextTokens: 262_144,
        outputTokens: 32_000,
      },
      "kimi-for-coding-highspeed": {
        name: "Kimi for Coding (K2.7 HighSpeed)",
        contextTokens: 262_144,
        outputTokens: 32_000,
      },
    },
  },
  // GLM Coding Plan (Z.ai). Endpoint, key page and tier mapping verified against the Z.ai docs
  // (docs.z.ai/devpack/tool/claude + /devpack/overview) 2026-08-07: the subscription key works on
  // the Anthropic-protocol endpoint, and Z.ai's own Claude Code setup maps haiku to glm-4.7 with
  // sonnet and opus on glm-5.2 — kept as-is here. glm-5-turbo is in the plan too but stays out of
  // the mapping; it would only displace glm-5.2 on a tier. Context/output sizes from the model
  // pages (docs.z.ai/guides/llm/glm-5.2, /glm-4.7).
  glm: {
    id: "glm",
    name: "GLM",
    baseUrl: "https://api.z.ai/api/anthropic",
    consoleUrl: "https://z.ai/manage-apikey/apikey-list",
    consoleName: "Z.ai API keys page",
    tagline: "Run Claude Code on your GLM Coding Plan subscription — paste the API key, no script to write.",
    // Z.ai documents no Fable tier; it gets glm-5.2 as well, so `/model fable` has a target.
    defaultStartupModel: "glm-5.2",
    defaultModel: "glm-5.2",
    defaultFableModel: "glm-5.2",
    defaultOpusModel: "glm-5.2",
    defaultHaikuModel: "glm-4.7",
    models: {
      "glm-5.2": { name: "GLM-5.2 (1M context)", contextTokens: 1_000_000, outputTokens: 128_000 },
      "glm-4.7": { name: "GLM-4.7 (200K context)", contextTokens: 200_000, outputTokens: 128_000 },
    },
  },
};

// Seed a config from a preset, with an empty key for the user to fill in. Per-tier models come
// from the preset's own defaults — there is no settings UI to override them (switch tiers with
// `/model fable|opus|sonnet|haiku` inside the running session instead).
export function seedBackendConfig(preset: BackendPreset): BackendConfig {
  return {
    name: preset.name,
    baseUrl: preset.baseUrl,
    authToken: "",
    startupModel: preset.defaultStartupModel,
    model: preset.defaultModel,
    fableModel: preset.defaultFableModel,
    opusModel: preset.defaultOpusModel,
    haikuModel: preset.defaultHaikuModel,
    models: preset.models,
  };
}

function shQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

// The wrapper script generated from a backend config. Points the whole Claude Code session at
// the endpoint; each Claude model tier (fable/opus/sonnet/haiku) maps to its configured model —
// defaulting to the main model when a tier has no override — so background/subagent calls do
// not ask the endpoint for a Claude model it does not serve.
export function generateBackendScript(config: BackendConfig): string {
  const fable = config.fableModel ?? config.model;
  const opus = config.opusModel ?? config.model;
  const haiku = config.haikuModel ?? config.model;
  const lines = [
    "#!/bin/sh",
    "# Generated by Code Workbench from the backend JSON next to this file.",
    "# Edit the JSON in plugin settings, not this script — it is regenerated on every change.",
    "unset ANTHROPIC_API_KEY",
    `export ANTHROPIC_BASE_URL=${shQuote(config.baseUrl)}`,
    `export ANTHROPIC_AUTH_TOKEN=${shQuote(config.authToken)}`,
    `export ANTHROPIC_MODEL=${shQuote(config.startupModel)}`,
    `export ANTHROPIC_DEFAULT_FABLE_MODEL=${shQuote(fable)}`,
    `export ANTHROPIC_DEFAULT_OPUS_MODEL=${shQuote(opus)}`,
    `export ANTHROPIC_DEFAULT_SONNET_MODEL=${shQuote(config.model)}`,
    `export ANTHROPIC_DEFAULT_HAIKU_MODEL=${shQuote(haiku)}`,
    'export CLAUDE_CODE_SUBAGENT_MODEL="$ANTHROPIC_MODEL"',
    "export ENABLE_TOOL_SEARCH=false",
  ];
  // No CLAUDE_CODE_AUTO_COMPACT_WINDOW override: it is one value for the whole session, so it
  // can't fit a mix of 256K and 1M tiers, and Claude Code's own `[1m]`-suffix parsing (see
  // model-config docs, "Pin models for third-party deployments") is meant to size each tier from
  // its own ANTHROPIC_DEFAULT_*_MODEL value instead — fable's `k3[1m]` already carries that
  // signal, opus/sonnet/haiku don't. (CLAUDE_CODE_MAX_CONTEXT_TOKENS, set here before, isn't a
  // real Claude Code variable — removed.)
  lines.push('exec claude "$@"');
  return lines.join("\n") + "\n";
}

// Writes/reads the backend JSON (0600) and the generated script (0700) under
// `<pluginDir>/backends/`. Mirrors the companion token-store permission model.
export class AgentBackends {
  constructor(private readonly pluginDir: string) {}

  private dir(): string {
    return path.join(this.pluginDir, "backends");
  }

  configPath(id: string): string {
    return path.join(this.dir(), `${id}.json`);
  }

  scriptPath(id: string): string {
    return path.join(this.dir(), `${id}.sh`);
  }

  async readConfig(id: string): Promise<BackendConfig | null> {
    try {
      const raw = JSON.parse(await fs.readFile(this.configPath(id), "utf8")) as Partial<BackendConfig>;
      if (typeof raw.baseUrl !== "string" || typeof raw.model !== "string") return null;
      return {
        name: typeof raw.name === "string" ? raw.name : id,
        baseUrl: raw.baseUrl,
        authToken: typeof raw.authToken === "string" ? raw.authToken : "",
        // Pre-decoupling configs have no startupModel of their own — they used `model` for both.
        startupModel: typeof raw.startupModel === "string" ? raw.startupModel : raw.model,
        model: raw.model,
        fableModel: typeof raw.fableModel === "string" ? raw.fableModel : undefined,
        opusModel: typeof raw.opusModel === "string" ? raw.opusModel : undefined,
        haikuModel: typeof raw.haikuModel === "string" ? raw.haikuModel : undefined,
        models: (raw.models as Record<string, BackendModel>) ?? {},
      };
    } catch {
      return null;
    }
  }

  // Persist the config (0600 JSON) and regenerate the script (0700). Returns the script path,
  // which is what a managed profile launches.
  async write(id: string, config: BackendConfig): Promise<string> {
    const dir = this.dir();
    await fs.mkdir(dir, { recursive: true });
    await fs.chmod(dir, 0o700).catch(() => undefined);

    const jsonTarget = this.configPath(id);
    const jsonTmp = `${jsonTarget}.tmp`;
    await fs.writeFile(jsonTmp, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
    await fs.chmod(jsonTmp, 0o600).catch(() => undefined);
    await fs.rename(jsonTmp, jsonTarget);

    const script = this.scriptPath(id);
    await fs.writeFile(script, generateBackendScript(config), { mode: 0o700 });
    await fs.chmod(script, 0o700).catch(() => undefined);
    return script;
  }

  async remove(id: string): Promise<void> {
    await fs.unlink(this.configPath(id)).catch(() => undefined);
    await fs.unlink(this.scriptPath(id)).catch(() => undefined);
  }
}
