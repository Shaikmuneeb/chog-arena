/* Copy the CWO intro artwork into the web app's static root, normalising
 * the file names so "/cwo intro N.jpeg" resolves for every frame.
 *
 *   node scripts/sync-cwo-frames.mjs
 */
import { copyFileSync, mkdirSync, readdirSync, rmdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

/* the artwork lives in the main workspace directory (chog-arena/) */
const SRC = join(root, "..", "..");
const DEST = join(root, "public");

/* the plate set the cinematic actually plays */
const COUNT = 19;

/* the old generated placeholder plates are superseded */
const STALE_DIR = join(DEST, "cwo-intro");

const files = readdirSync(SRC).filter((f) => /^cwo intro \d+ ?\.jpeg$/i.test(f));

/* index them by their number â€” several have a stray space before the
 * extension ("cwo intro 10 .jpeg") */
const byIndex = new Map();
for (const f of files) {
  const n = Number(f.match(/(\d+)/)[1]);
  if (!byIndex.has(n)) byIndex.set(n, f);
}

mkdirSync(DEST, { recursive: true });

let copied = 0;
let bytes = 0;
for (let i = 1; i <= COUNT; i++) {
  const src = byIndex.get(i);
  if (!src) {
    console.warn(`  MISSING: cwo intro ${i}.jpeg`);
    continue;
  }
  const dest = join(DEST, `cwo intro ${i}.jpeg`);
  copyFileSync(join(SRC, src), dest);
  bytes += statSync(dest).size;
  copied++;
  console.log(`  ${src}  ->  public/cwo intro ${i}.jpeg`);
}

/* drop the superseded placeholder plates */
let stale = 0;
try {
  for (const f of readdirSync(STALE_DIR)) {
    unlinkSync(join(STALE_DIR, f));
    stale++;
  }
  rmdirSync(STALE_DIR);
} catch {
  /* nothing to clean */
}

console.log(
  `\n${copied}/${COUNT} frames copied (${(bytes / 1048576).toFixed(2)} MB)` +
    (stale ? ` Â· ${stale} placeholder plates removed` : ""),
);

