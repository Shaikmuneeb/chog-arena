/* Copy the Chog theme track into the web app's static root.
 *
 *   node scripts/sync-cwo-theme.mjs
 *
 * The song lives in the main workspace directory (chog-arena/), next to the
 * CWO intro artwork. The workspace file is the source of truth: it is only
 * ever COPIED, never moved, renamed or rewritten, so the original keeps
 * working for anything else that reads it.
 *
 * The file name is preserved exactly, spaces and all, so the track in the
 * public root is the same track.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

/* the artwork lives in the main workspace directory (chog-arena/) */
const SRC = join(root, "..", "..");
const DEST = join(root, "public");

/* the theme track - "we believe in chog" */
const TRACK = "we believe in chog (chog).mp3";

const src = join(SRC, TRACK);
if (!existsSync(src)) {
  console.error(`  MISSING: ${TRACK}`);
  console.error(`  looked in ${SRC}`);
  process.exit(1);
}

mkdirSync(DEST, { recursive: true });
const dest = join(DEST, TRACK);
copyFileSync(src, dest);

console.log(`  ${TRACK}  ->  public/${TRACK}`);
console.log(
  `\n1 theme track copied (${(statSync(dest).size / 1048576).toFixed(2)} MB)`,
);
