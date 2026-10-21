/**
 * Converts the arena's CWO lettering into vector paths the cinematic intro
 * can mask with.
 *
 *   node scripts/gen-cwo-lockup.mjs
 *
 * The 3D arena draws "CWO" with the three.js helvetiker typeface. This
 * script reads the same typeface and emits:
 *   - src/config/cwoLockup.ts   the glyph paths for the neon overlay
 *   - public/fonts/cwo-lockup.svg  an opaque-on-transparent mask for
 *                                 CSS `mask-image` (the images ride inside
 *                                 the letter shapes)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const typeface = JSON.parse(
  readFileSync(join(root, "public", "fonts", "helvetiker_bold.typeface.json"), "utf8"),
);

const LETTERS = ["C", "W", "O"];
const PAD = 48;

/**
 * three.js writes typeface outlines with SVG-looking commands but ABSOLUTE
 * coordinates — SVG's lowercase `q`/`l` are relative, so the raw string has
 * to be re-issued with the absolute forms or the letterforms come out as
 * nonsense.
 */
function toAbsolutePath(outline) {
  return outline
    .split(" ")
    .map((token) => {
      if (token === "m" || token === "l" || token === "q") return token.toUpperCase();
      return token;
    })
    .join(" ");
}

/* the glyphs sit on a baseline at y = 0 and reach y = 1040 (cap height) */
const glyphs = LETTERS.map((ch) => {
  const g = typeface.glyphs[ch];
  if (!g) throw new Error(`glyph ${ch} missing from the typeface`);
  return { ch, d: toAbsolutePath(g.o), advance: g.ha };
});

/* lay the glyphs out left to right */
let x = 0;
const placed = glyphs.map((g) => {
  const p = { ...g, x };
  x += g.advance;
  return p;
});

const inkWidth = x;
const fontMinY = -29;
const fontMaxY = 1040;
const inkHeight = fontMaxY - fontMinY;

/* the SVG is y-down: flip the font's y-up space around this baseline */
const baselineY = fontMaxY + PAD;
const viewBox = {
  minX: -PAD,
  minY: baselineY - fontMaxY - PAD,
  width: inkWidth + PAD * 2,
  height: inkHeight + PAD * 2,
};
const flip = `translate(0 ${baselineY}) scale(1 -1)`;

/* ---- the mask file (CSS mask-image source) ---- */
const maskPaths = placed
  .map((g) => `<path d="${g.d}" transform="translate(${g.x} 0)"/>`)
  .join("");
const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}" width="${Math.round(
  viewBox.width,
)}" height="${Math.round(viewBox.height)}"><g fill="#fff" transform="${flip}">${maskPaths}</g></svg>`;
writeFileSync(join(root, "public", "fonts", "cwo-lockup.svg"), maskSvg);

/* ---- the TS module (neon letter overlay) ---- */
const ts = `/**
 * The CWO letterforms, generated from the arena's helvetiker typeface.
 *
 *   node scripts/gen-cwo-lockup.mjs
 *
 * Do not edit by hand — regenerate instead. The cinematic intro masks the
 * intro frames with these exact shapes, so they match the CWO logo the 3D
 * arena extrudes on the stage.
 */

/** viewBox of the letter lockup. */
export const CWO_VIEWBOX = {
  minX: ${viewBox.minX},
  minY: ${viewBox.minY},
  width: ${viewBox.width},
  height: ${viewBox.height},
};

/** aspect ratio (width / height) of the lockup. */
export const CWO_ASPECT = ${(viewBox.width / viewBox.height).toFixed(6)};

/** Transform that flips the font's y-up space into the SVG's y-down space. */
export const CWO_FLIP = ${JSON.stringify(flip)};

/** The three glyph outlines, already positioned. */
export const CWO_GLYPHS: readonly { ch: string; d: string; x: number }[] = [
${placed
  .map(
    (g) =>
      `  { ch: "${g.ch}", x: ${g.x}, d: ${JSON.stringify(g.d)} },`,
  )
  .join("\n")}
];

/** CSS mask source: the letter shapes as opaque-on-transparent artwork. */
export const CWO_MASK_URL = "/fonts/cwo-lockup.svg";
`;
writeFileSync(join(root, "src", "config", "cwoLockup.ts"), ts);

console.log(
  `CWO lockup: ${placed.length} glyphs · ${Math.round(viewBox.width)}x${Math.round(
    viewBox.height,
  )} · aspect ${(viewBox.width / viewBox.height).toFixed(3)}`,
);
console.log("  -> public/fonts/cwo-lockup.svg");
console.log("  -> src/config/cwoLockup.ts");
