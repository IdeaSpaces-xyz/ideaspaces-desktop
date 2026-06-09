// Compose the app icon from the canonical IdeaSpaces hexagon mark, then hand it
// to `tauri icon` to generate every platform size.
//
// Output: a 1024px source PNG (cream mark on an ink rounded-square — macOS-style
// squircle with transparent corners). Run: `npm run make-icon`, which also runs
// `tauri icon` on the result.

import sharp from "sharp";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
// Vendored copy of the canonical mark (projects/IdeaSpaces Design System/assets)
// so the icon is reproducible without that sibling checked out.
const logoPath = join(here, "logo-symbol.svg");

const svg = readFileSync(logoPath, "utf8");
const d = svg.match(/\sd="([^"]+)"/)?.[1];
if (!d) {
  console.error("make-icon: could not extract the logo path from", logoPath);
  process.exit(1);
}

const SIZE = 1024;
const PAD = 96; // squircle inset → ~80% of canvas
const RADIUS = 205; // ≈ macOS superellipse corner
const INK = "#242321";
const CREAM = "#ece7d7";

// Hexagon mark (viewBox 0 0 92.015 80), centered at ~47% of the canvas width.
const markW = 480;
const scale = markW / 92.015;
const markH = 80 * scale;
const tx = (SIZE - markW) / 2;
const ty = (SIZE - markH) / 2;

const composite = `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${PAD}" y="${PAD}" width="${SIZE - PAD * 2}" height="${SIZE - PAD * 2}" rx="${RADIUS}" fill="${INK}"/>
  <g transform="translate(${tx} ${ty}) scale(${scale})" fill="${CREAM}"><path fill-rule="nonzero" d="${d}"/></g>
</svg>`;

const out = join(root, "icon-source.png");
await sharp(Buffer.from(composite)).png().toFile(out);
console.log("make-icon: wrote", out);
