/* Copy the fighter card banners into the web app's static root.
 *
 *   node scripts/sync-cwo-banners.mjs
 *
 * The banners live in the main workspace directory (chog-arena/), next to
 * the CWO intro artwork. The originals are never moved or renamed — only
 * copied, so the workspace stays the source of truth.
 *
 * Filenames are preserved exactly as they are on disk.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const SRC = join(root, "..", "..");
const DEST = join(root, "public", "banners");

const BANNERS = [
  "james-card new banner.png",
  "chog princess card new banner.png",
];

mkdirSync(DEST, { recursive: true });

let copied = 0;
let bytes = 0;
for (const name of BANNERS) {
  const src = join(SRC, name);
  if (!existsSync(src)) {
    console.warn(`  MISSING: ${name}`);
    continue;
  }
  const dest = join(DEST, name);
  copyFileSync(src, dest);
  bytes += statSync(dest).size;
  copied++;
  console.log(`  ${name}  ->  public/banners/${name}`);
}

console.log(
  `\n${copied}/${BANNERS.length} banners copied (${(bytes / 1048576).toFixed(2)} MB)`,
);
