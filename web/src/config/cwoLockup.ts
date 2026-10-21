/**
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
  minX: -48,
  minY: 0,
  width: 3632,
  height: 1165,
};

/** aspect ratio (width / height) of the lockup. */
export const CWO_ASPECT = 3.117597;

/** Transform that flips the font's y-up space into the SVG's y-down space. */
export const CWO_FLIP = "translate(0 1088) scale(1 -1)";

/** The three glyph outlines, already positioned. */
export const CWO_GLYPHS: readonly { ch: string; d: string; x: number }[] = [
  { ch: "C", x: 0, d: "M 970 345 Q 802 70 933 169 Q 490 -29 672 -29 Q 130 130 268 -29 Q 0 506 0 281 Q 134 885 0 737 Q 502 1040 275 1040 Q 802 939 668 1040 Q 965 679 936 838 L 745 679 Q 649 809 716 761 Q 495 857 582 857 Q 283 747 361 857 Q 214 508 214 648 Q 282 267 214 367 Q 493 154 359 154 Q 651 204 584 154 Q 752 345 718 255 L 970 345 " },
  { ch: "W", x: 1043, d: "M 1291 1013 L 1002 0 L 802 0 L 645 777 L 490 0 L 288 0 L 0 1013 L 215 1013 L 388 298 L 534 1012 L 757 1013 L 904 299 L 1076 1013 L 1291 1013 " },
  { ch: "O", x: 2442, d: "M 497 -29 Q 133 127 272 -29 Q 0 505 0 277 Q 131 883 0 733 Q 497 1040 270 1040 Q 860 883 721 1040 Q 994 505 994 733 Q 862 127 994 277 Q 497 -29 723 -29 M 497 154 Q 710 266 631 154 Q 780 506 780 365 Q 710 745 780 647 Q 497 857 631 857 Q 283 747 361 857 Q 213 506 213 647 Q 282 266 213 365 Q 497 154 361 154 " },
];

/** CSS mask source: the letter shapes as opaque-on-transparent artwork. */
export const CWO_MASK_URL = "/fonts/cwo-lockup.svg";
