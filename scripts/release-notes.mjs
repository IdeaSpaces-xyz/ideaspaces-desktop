// Print the CHRONICLE.md entry for a given version, for use as the release body
// (and thus the updater's latest.json notes, which the app shows on update).
//
//   node scripts/release-notes.mjs v0.2.0
//
// Entries are `## vX.Y.Z · <title>` sections, each running to the next `## vN`
// heading (or EOF). Exits non-zero if the version has no entry — so a release
// can't go out without its story written first.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const arg = process.argv[2];
if (!arg) {
  console.error("usage: release-notes.mjs <version>");
  process.exit(2);
}
const version = arg.replace(/^v/, "");

const lines = readFileSync(join(root, "CHRONICLE.md"), "utf8").split("\n");
const startRe = new RegExp(`^##\\s+v${version.replace(/\./g, "\\.")}(\\s|$)`);

let start = -1;
for (let i = 0; i < lines.length; i++) {
  if (startRe.test(lines[i])) {
    start = i;
    break;
  }
}
if (start === -1) {
  console.error(`release-notes: no CHRONICLE.md entry for v${version} — add one before releasing.`);
  process.exit(1);
}

let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
  if (/^##\s+v\d/.test(lines[i])) {
    end = i;
    break;
  }
}

process.stdout.write(lines.slice(start, end).join("\n").trim() + "\n");
