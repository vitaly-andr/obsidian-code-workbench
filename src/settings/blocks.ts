// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

import { Notice, Setting } from "obsidian";
import type CodeWorkbenchPlugin from "../../main";
import { BACKEND_PRESETS, seedBackendConfig } from "../util/agent-backends";
import { newLaunchProfileId } from "../util/launch-profiles";
import type { LaunchProfile } from "../util/launch-profiles";
import { openExternal } from "../util/open-external";
import type { ScanResult } from "../lsp";
import {
  CONNECT_CAPTION,
  FEATURES,
  INTRO_PARAGRAPHS,
  INTRO_PITCH,
  LANGS,
  LANGUAGE_DISPLAY_NAMES,
  LANGUAGE_SUPPORT_INTRO,
  LICENSE_TEXT,
  OPTIONAL_NOTE,
  SHOTS,
  SPONSORSHIP_TEXT,
  SUPPORT_TEXT,
  DONATE_TEXT,
  USING_IT_STEPS,
} from "./copy";
import type { CwRender, SettingsHost } from "./types";

// Screenshots are fetched from the repo via jsDelivr (CDN, browser-cached) instead of inlined —
// the same lazy pattern as grammars and icons, so they stay full-quality and off the main.js
// bundle. The crypto/contact QR codes are small and bundled (qr.ts), imported when a block that
// needs them renders — never on the plugin's load path.
const SHOT_CDN = "https://cdn.jsdelivr.net/gh/vitaly-andr/obsidian-code-workbench@main/docs/";
const SHOT_FILES: Record<string, string> = {
  WORKBENCH_SHOT: "workbench.png",
  DIFF_SHOT: "keep-reject-diff.png",
  GIT_BRANCH_SHOT: "git-branch.png",
  GIT_GRAPH_SHOT: "git-graph-panel.png",
  GIT_BLAME_SHOT: "git-blame.png",
  ICONS_SHOT: "file-icons.png",
  HIDDEN_SHOT: "hidden-files.png",
  CONNECT_SHOT: "connect.png",
};

function addShot(parent: HTMLElement, key: string, alt: string): void {
  parent.createEl("img", {
    cls: "cw-shot",
    attr: { alt, src: SHOT_CDN + SHOT_FILES[key], loading: "lazy" },
  });
}

function caption(parent: HTMLElement, text: string): void {
  parent.createEl("p", { cls: "setting-item-description", text });
}

/**
 * Wraps free-form content as a row. Obsidian gives every definition a `.setting-item` row and
 * fills in name and description before handing it over; a block that paints prose, an image or a
 * table owns the whole row instead, so it clears that scaffolding and takes the `cw-block` class
 * which strips the row chrome (styles.css).
 */
function block(paint: (el: HTMLElement) => void): CwRender {
  return (setting: Setting) => {
    const el = setting.settingEl;
    el.empty();
    el.addClass("cw-block");
    paint(el);
  };
}

export function introBlock(plugin: CodeWorkbenchPlugin): CwRender {
  return block((el) => {
    const badges = el.createDiv({ cls: "cw-badges" });
    const badge = (text: string, color: string): void => {
      badges.createSpan({ cls: `cw-badge cw-badge-${color}`, text });
    };
    badge(`v${plugin.manifest.version}`, "green");
    badge("PolyForm Shield 1.0.0", "blue");
    badge("Desktop only", "grey");

    for (const text of INTRO_PARAGRAPHS) {
      el.createEl("p", { cls: "setting-item-description", text });
    }
    el.createEl("p", { cls: "setting-item-description" }).createEl("em", { text: INTRO_PITCH });

    addShot(el, "WORKBENCH_SHOT", "A code file open in the Code Workbench editor");
  });
}

export function featuresBlock(): CwRender {
  return block((el) => {
    const feats = el.createEl("ul");
    for (const [lead, rest] of FEATURES) {
      const li = feats.createEl("li");
      li.createEl("strong", { text: lead });
      li.createSpan({ text: `: ${rest}` });
    }
    for (const [key, alt, text] of SHOTS) {
      addShot(el, key, alt);
      caption(el, text);
    }
  });
}

export function usingItBlock(): CwRender {
  return block((el) => {
    const steps = el.createEl("ol");
    for (const text of USING_IT_STEPS) steps.createEl("li", { text });
    addShot(el, "CONNECT_SHOT", "Claude Code's /ide picker with Obsidian connected");
    caption(el, CONNECT_CAPTION);
  });
}

export function languageTableBlock(): CwRender {
  return block((el) => {
    caption(el, LANGUAGE_SUPPORT_INTRO);
    const tableWrap = el.createDiv({ cls: "cw-lang-table-wrap" });
    const table = tableWrap.createEl("table", { cls: "cw-lang-table" });
    const head = table.createEl("thead").createEl("tr");
    for (const h of ["Language", "Highlighting", "Diagnostics", "Formatting"]) {
      head.createEl("th", { text: h });
    }
    const body = table.createEl("tbody");
    for (const [name, hi, di, fo] of LANGS) {
      const tr = body.createEl("tr");
      tr.createEl("td", { text: name });
      tr.createEl("td", { text: hi ? "✅" : "—" });
      tr.createEl("td", { text: di ? "✅" : "—" });
      tr.createEl("td", { text: fo ? "✅" : "—" });
    }
  });
}

export function tryItBlock(): CwRender {
  return block((el) => {
    const tryP = el.createEl("p", { cls: "setting-item-description" });
    tryP.createSpan({ text: "Add the sample files to this vault, then open a language folder: " });
    tryP.createEl("code", { text: "sample-*" });
    tryP.createSpan({ text: " for highlighting, " });
    tryP.createEl("code", { text: "messy-*" });
    tryP.createSpan({ text: " for a diagnostic (a red underline at the spot marked in a comment), and " });
    tryP.createEl("code", { text: "format-me-*" });
    tryP.createSpan({ text: " for formatting (run Format code file and watch the layout fix itself)." });
  });
}

/** A standalone paragraph of settings copy, outside any control row. */
export function paragraphBlock(text: string): CwRender {
  return block((el) => caption(el, text));
}

export function optionalNoteBlock(): CwRender {
  return paragraphBlock(OPTIONAL_NOTE);
}

export function demoButton(plugin: CodeWorkbenchPlugin): CwRender {
  return (setting) => {
    setting.addButton((b) =>
      b
        .setCta()
        .setButtonText("Add demo files to this vault")
        .onClick(() => {
          void plugin.installDemo();
        }),
    );
  };
}

/**
 * The IDE server's live status, as the row's description. The definition carries a description of
 * its own for the search index, because that one is read when the definitions are built — at
 * plugin load, before the server has a port to report.
 */
export function connectionStatus(plugin: CodeWorkbenchPlugin): CwRender {
  return (setting) => {
    setting.setDesc(plugin.statusText());
  };
}

/**
 * How the vault tools are reached from a CLI session: the project `.mcp.json` the plugin writes,
 * with the manual command as a fallback. Only rendered while the tools are on.
 */
export function companionBlock(plugin: CodeWorkbenchPlugin): CwRender {
  return block((el) => {
    const cmd = plugin.companionCommand();
    const vt = el.createEl("p", { cls: "setting-item-description" });
    if (cmd) {
      vt.createSpan({
        text:
          `Connected automatically: a project .mcp.json is written to this vault, so a fresh ` +
          `"claude" session in the vault folder lists the obsidian-vault tools after a one-time ` +
          `approval. Manual fallback:`,
      });
      el.createEl("pre", { cls: "cw-mcp-cmd" }).createEl("code", { text: cmd });
    } else {
      vt.setText("Starting the companion server…");
    }
  });
}

// Human-readable label for a canonical grammar id (src/lsp/registry.ts), for the "Detected language
// servers" list (006). Falls back to a capitalized id for anything not listed here.
function languageDisplayName(language: string): string {
  return LANGUAGE_DISPLAY_NAMES[language] ?? language.charAt(0).toUpperCase() + language.slice(1);
}

// The runnable install command inside a registry install hint, for the copy button (006). The command
// is the first backtick-wrapped span that has arguments (a space) — e.g. `gem install ruby-lsp`; a bare
// `binary` name like `zls` is a reference, not a command, so those hints get no copy button.
function installCommandFrom(hint: string): string | null {
  const match = hint.match(/`([^`]+\s[^`]+)`/);
  return match ? match[1] : null;
}

// "on PATH" / "via a version manager" / "user-configured" (FR-010).
function originLabel(origin: "path" | "version-manager" | "user"): string {
  if (origin === "version-manager") return "via a version manager";
  if (origin === "user") return "user-configured";
  return "on PATH";
}

/**
 * Detected language servers (006): scan the resolved environment on render and list each
 * connectable language. The scan runs here rather than while the definitions are built, because
 * definitions are built at plugin load — see `getSettingDefinitions` in main.ts.
 */
export function scanBlock(plugin: CodeWorkbenchPlugin): CwRender {
  return block((el) => {
    // Obsidian 1.13 renders every row and only then hides the ones whose `visible` says so, so a
    // hidden row's callback still runs. The master switch has to be checked here as well, or
    // opening settings would start a language-server scan with the feature turned off.
    if (!plugin.settings.lsp.enabled) return;

    const scanContainer = el.createDiv({ cls: "cw-lsp-scan" });
    new Setting(scanContainer).setName("Scanning…").setDesc("Looking for installed language servers.");

    // "Show all / not installed" is a pure repaint of the last scan result — no re-scan, so
    // toggling it never flashes "Scanning…" (that stays reserved for an actual (re)scan).
    let notInstalledOpen = false;

    const paintScan = (result: ScanResult): void => {
      scanContainer.empty();

      if (result.detected.length === 0) {
        // Never a blank area (FR-006): point at how to install one and where the hints are.
        new Setting(scanContainer)
          .setName("No language servers detected")
          .setDesc(
            "None of the supported servers were found. See \"Show all / not installed\" below for " +
              "install hints, then Rescan.",
          );
      }
      for (const server of result.detected) {
        // Toggle drives the same perLanguage map the editor runtime reads (FR-012): ON deletes
        // the key (absent = enabled), OFF writes `false`. onChange re-applies to open editors
        // immediately (SC-002), superseding the old comma-separated "Disabled languages" field.
        new Setting(scanContainer)
          .setName(`${languageDisplayName(server.language)} — ${server.serverId}`)
          .setDesc(`Detected ${originLabel(server.origin)}.`)
          .addToggle((toggle) =>
            toggle
              .setValue(plugin.settings.lsp.perLanguage[server.language] !== false)
              .onChange(async (value) => {
                if (value) delete plugin.settings.lsp.perLanguage[server.language];
                else plugin.settings.lsp.perLanguage[server.language] = false;
                await plugin.saveData(plugin.settings);
                plugin.refreshLspViews();
              }),
          );
      }

      new Setting(scanContainer)
        .setName("Rescan")
        .setDesc("Re-run detection, e.g. right after installing a server. No restart needed.")
        .addButton((button) => button.setButtonText("Rescan").onClick(() => void runScan(true)));

      new Setting(scanContainer)
        .setName(notInstalledOpen ? "Hide not-installed languages" : "Show all / not installed")
        .setDesc("The remaining supported languages with no detected server, and how to install one.")
        .addButton((button) =>
          button.setButtonText(notInstalledOpen ? "Hide" : "Show all").onClick(() => {
            notInstalledOpen = !notInstalledOpen;
            paintScan(result);
          }),
        );
      if (notInstalledOpen) {
        for (const lang of result.notDetected) {
          const row = new Setting(scanContainer)
            .setName(languageDisplayName(lang.language))
            .setDesc(lang.installHint);
          // Copy the install command to the clipboard (the hint's command is otherwise unselectable
          // prose). Shown only when the hint carries a runnable command, not a bare binary name.
          const command = installCommandFrom(lang.installHint);
          if (command) {
            row.addExtraButton((button) =>
              button
                .setIcon("copy")
                .setTooltip(`Copy: ${command}`)
                .onClick(() => {
                  void navigator.clipboard.writeText(command);
                  new Notice("Install command copied");
                }),
            );
          }
        }
      }
    };

    const runScan = async (rescan: boolean): Promise<void> => {
      scanContainer.empty();
      new Setting(scanContainer).setName("Scanning…").setDesc("Looking for installed language servers.");
      const controller = await plugin.ensureLspController();
      if (rescan) (await import("../lsp")).invalidateEnvironmentCache();
      const result = await controller.scanServers();
      // The tab may have re-rendered (master toggle) or closed while the scan was in flight;
      // isConnected is false once the row was detached — skip that paint.
      if (!scanContainer.isConnected) return;
      paintScan(result);
    };

    void runScan(false);
  });
}

/** Custom LSP servers: one "language = command arg1 arg2" per line, parsed on change (FR-025). */
export function customServersBlock(plugin: CodeWorkbenchPlugin): CwRender {
  return (setting) => {
    const customLines = Object.entries(plugin.settings.lsp.customServers)
      .map(([lang, s]) => `${lang} = ${[s.command, ...(s.args ?? [])].join(" ")}`)
      .join("\n");
    setting.addTextArea((area) =>
      area.setValue(customLines).onChange(async (value) => {
        const map: Record<string, { command: string; args?: string[] }> = {};
        for (const line of value.split("\n")) {
          const eq = line.indexOf("=");
          if (eq < 0) continue;
          const lang = line.slice(0, eq).trim().toLowerCase();
          const parts = line.slice(eq + 1).trim().split(/\s+/).filter(Boolean);
          if (!lang || parts.length === 0) continue;
          map[lang] = { command: parts[0], args: parts.slice(1) };
        }
        plugin.settings.lsp.customServers = map;
        await plugin.saveData(plugin.settings);
        plugin.refreshLspViews();
      }),
    );
  };
}

/** Where a preset's subscription keys are issued. */
export function backendConsoleBlock(presetId: string): CwRender {
  return block((el) => {
    const preset = BACKEND_PRESETS[presetId];
    if (!preset) return;
    const consoleHint = el.createEl("p", { cls: "setting-item-description" });
    consoleHint.appendText(`Create a ${preset.name} subscription API key in the `);
    const consoleLink = consoleHint.createEl("a", { text: preset.consoleName, href: preset.consoleUrl });
    consoleLink.addEventListener("click", (e) => {
      e.preventDefault();
      openExternal(preset.consoleUrl);
    });
    consoleHint.appendText(".");
  });
}

/** The button that adds a backend for a preset the user has not configured yet. */
export function addBackendButton(plugin: CodeWorkbenchPlugin, presetId: string, host: SettingsHost): CwRender {
  return (setting) => {
    const preset = BACKEND_PRESETS[presetId];
    if (!preset) return;
    setting.addButton((b) =>
      b
        .setCta()
        .setButtonText(`Add ${preset.name} backend`)
        .onClick(async () => {
          const profiles = plugin.settings.launchProfiles;
          const id = newLaunchProfileId(profiles);
          profiles.push({
            id,
            name: `Claude × ${preset.name}`,
            command: "",
            backend: { presetId: preset.id, model: preset.defaultModel },
          });
          // Seed the 0600 JSON + 0700 script now (empty key) so the files exist to fill in.
          await plugin.backends?.write(id, seedBackendConfig(preset));
          await plugin.saveData(plugin.settings);
          host.refresh();
        }),
    );
  };
}

/** A configured backend: its API-key field, launch and delete buttons. */
export function backendRow(plugin: CodeWorkbenchPlugin, profile: LaunchProfile, host: SettingsHost): CwRender {
  return (row) => {
    // API key field — the plugin saves it into the backend's 0600 JSON (never data.json).
    row.addText((t) => {
      t.setPlaceholder("API key");
      t.inputEl.type = "password";
      void plugin.backends?.readConfig(profile.id).then((cfg) => {
        if (cfg?.authToken) t.setValue(cfg.authToken);
      });
      t.onChange(async (value) => {
        await plugin.syncBackend(profile, value.trim());
      });
    });
    // Launch this backend now (same as picking it from the status-bar right-click menu).
    row.addExtraButton((b) =>
      b
        .setIcon("play")
        .setTooltip("Launch this backend")
        .onClick(() => void plugin.launchProfile(profile)),
    );
    row.addExtraButton((b) =>
      b
        .setIcon("trash")
        .setTooltip("Delete backend")
        .onClick(async () => {
          const profiles = plugin.settings.launchProfiles;
          const idx = profiles.indexOf(profile);
          if (idx >= 0) profiles.splice(idx, 1);
          await plugin.backends?.remove(profile.id);
          await plugin.saveData(plugin.settings);
          host.refresh();
        }),
    );
  };
}

/**
 * The model tiers a preset pins. There is no model picker in the backend row: a preset maps
 * fable/opus/sonnet/haiku to its own models (see BACKEND_PRESETS), and Claude Code's own
 * `/model fable|opus|sonnet|haiku` switches between them inside the running session. Spelled out
 * here, since there is no other UI for it.
 */
export function backendTiersBlock(presetId: string): CwRender {
  return block((el) => {
    const preset = BACKEND_PRESETS[presetId];
    if (!preset) return;
    const modelName = (id: string): string => preset.models[id]?.name ?? id;
    el.createEl("p", {
      cls: "setting-item-description",
      text: `${preset.name} model tiers — switch with /model inside the running session:`,
    });
    const tierTable = el.createEl("table", { cls: "cw-backend-tiers" });
    const tierHeader = tierTable.createEl("tr");
    tierHeader.createEl("th", { text: "Tier" });
    tierHeader.createEl("th", { text: `${preset.name} model` });
    const tierRows: [string, string][] = [
      ["Start", modelName(preset.defaultStartupModel)],
      ["sonnet", modelName(preset.defaultModel)],
      ["opus", modelName(preset.defaultOpusModel)],
      ["haiku", modelName(preset.defaultHaikuModel)],
      ["fable", modelName(preset.defaultFableModel)],
    ];
    for (const [tier, model] of tierRows) {
      const tr = tierTable.createEl("tr");
      tr.createEl("td", { text: tier });
      tr.createEl("td", { text: model });
    }
  });
}

export function launchButton(plugin: CodeWorkbenchPlugin, profile?: LaunchProfile): CwRender {
  const label = profile ? `▶ Launch ${profile.name} in this vault` : "▶ Launch Claude in this vault";
  return (setting) => {
    setting.addButton((b) =>
      b
        .setCta()
        .setButtonText(label)
        .onClick(() => {
          void plugin.launchProfile(profile);
        }),
    );
  };
}

export function supportIntroBlock(): CwRender {
  return block((el) => caption(el, SUPPORT_TEXT));
}

/** Crypto addresses as QR codes, imported from the bundled qr.ts only when this row renders. */
export function donateBlock(): CwRender {
  return block((el) => {
    const donate = el.createEl("details", { cls: "cw-donate" });
    donate.createEl("summary", { text: "♥ Support with crypto" });
    donate.createEl("p", { cls: "setting-item-description", text: DONATE_TEXT });
    const pending: Array<[HTMLImageElement, string]> = [];
    const coin = (label: string, qrKey: string): void => {
      const row = donate.createDiv({ cls: "cw-coin" });
      row.createDiv({ cls: "cw-coin-label", text: label });
      const img = row.createEl("img", { cls: "cw-coin-qr", attr: { alt: `${label} QR` } });
      pending.push([img, qrKey]);
    };
    coin("EVM — USDT / USDC / ETH (Polygon, Base, BSC, Arbitrum)", "QR_EVM");
    coin("USDT — TRON / TRC20", "QR_TRON");
    coin("Bitcoin", "QR_BTC");
    void import("../util/qr").then((qr) => {
      const assets = qr as unknown as Record<string, string>;
      for (const [img, key] of pending) img.src = assets[key];
    });
  });
}

/** Formats the code file open behind the settings modal — the "Format code file" command. */
export function formatButton(plugin: CodeWorkbenchPlugin): CwRender {
  return (setting) => {
    setting.addButton((button) => {
      button.setButtonText("Format").onClick(() => plugin.formatActiveCodeFile());
    });
  };
}

/** Opens the branch graph panel, the same call the ribbon icon makes. */
export function graphButton(plugin: CodeWorkbenchPlugin): CwRender {
  return (setting) => {
    setting.addButton((button) => {
      button.setButtonText("Open graph").onClick(() => void plugin.openGitGraphPanel());
    });
  };
}

export function linkButton(text: string, url: string): CwRender {
  return (setting) => {
    setting.addButton((b) => b.setButtonText(text).onClick(() => openExternal(url)));
  };
}

export function contactButtons(): CwRender {
  return (setting) => {
    setting
      .addButton((b) =>
        b.setButtonText("Telegram @VITALY_ANDR").onClick(() => openExternal("https://t.me/VITALY_ANDR")),
      )
      .addButton((b) => b.setButtonText("Email").onClick(() => openExternal("mailto:vitaly@andrianoff.online")));
  };
}

export function sponsorshipBlock(): CwRender {
  return block((el) => caption(el, SPONSORSHIP_TEXT));
}

export function telegramQrBlock(): CwRender {
  return block((el) => {
    const qrEl = el.createDiv({ cls: "cw-qr" });
    const link = qrEl.createEl("a", { href: "https://t.me/VITALY_ANDR" });
    link.addEventListener("click", (e) => {
      e.preventDefault();
      openExternal("https://t.me/VITALY_ANDR");
    });
    const qrImg = link.createEl("img", { cls: "cw-qr-img", attr: { alt: "Telegram @VITALY_ANDR" } });
    void import("../util/qr").then((qr) => {
      const assets = qr as unknown as Record<string, string>;
      qrImg.src = assets.TELEGRAM_QR;
    });
  });
}

export function licenseBlock(): CwRender {
  return block((el) => {
    el.createEl("p", { cls: "setting-item-description cw-license", text: LICENSE_TEXT });
  });
}
