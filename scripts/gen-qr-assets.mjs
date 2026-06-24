// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright 2026 Vitaly Andrianov. See LICENSE.

// Regenerates src/util/qr.ts: inlines the settings-tab images from docs/ as optimized base64
// data-URIs. Screenshots are downscaled to ~720px and JPEG-compressed; QR codes are downscaled and
// reduced to a tiny palette PNG. Run: node scripts/gen-qr-assets.mjs
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

// Only the tiny crypto/contact QR codes are inlined. Settings screenshots are fetched from the repo
// via jsDelivr at runtime (see the settings tab), so they stay full-quality and off the bundle.
const ASSETS = [
  { name: "TELEGRAM_QR", src: "docs/telegram-qr.png", kind: "qr" },
  { name: "QR_EVM", src: "docs/evm.jpg", kind: "qr" },
  { name: "QR_TRON", src: "docs/tron.jpg", kind: "qr" },
  { name: "QR_BTC", src: "docs/btc.jpg", kind: "qr" },
];

function optimize(src, kind) {
  const out = `/tmp/qrgen-out`;
  if (kind === "shot") {
    // UI screenshots: fit within 600px, strip metadata, JPEG q70 (small, fine for decoration).
    // Kept compact so the whole settings-tab gallery stays comfortably under the 5 MB bundle limit.
    execSync(`magick ${src} -resize 600x600\\> -strip -interlace Plane -quality 70 jpg:${out}`);
    return { mime: "image/jpeg", bytes: readFileSync(out) };
  }
  // QR codes: composite any transparency onto white (some sources are RGBA), fit within 320px, then
  // threshold to black & white — crisp, scannable, and tiny.
  execSync(`magick ${src} -background white -alpha remove -alpha off -resize 320x320\\> -colorspace Gray -threshold 55% -strip png8:${out}`);
  return { mime: "image/png", bytes: readFileSync(out) };
}

const lines = [
  "// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0",
  "// Copyright 2026 Vitaly Andrianov. See LICENSE.",
  "",
  "// Inlined image assets for the settings tab (no external files needed).",
  "// Generated from docs/ by scripts/gen-qr-assets.mjs — do not edit by hand.",
];
for (const a of ASSETS) {
  const { mime, bytes } = optimize(a.src, a.kind);
  const b64 = bytes.toString("base64");
  console.log(`${a.name}: ${(bytes.length / 1024).toFixed(1)} KB (${(b64.length / 1024).toFixed(1)} KB base64)`);
  lines.push(`export const ${a.name} = "data:${mime};base64,${b64}";`);
}
writeFileSync("src/util/qr.ts", lines.join("\n") + "\n");
console.log("wrote src/util/qr.ts");
