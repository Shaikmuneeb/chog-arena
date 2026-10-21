import type { FighterClass } from "./fighterClasses";

/**
 * Where the two fighters stand on the arena stage.
 *
 * The stage has one fixed line: Chog Princess owns the left of the CWO
 * lettering and Void Lord James the right, so a pair always flanks the logo
 * and never crosses it. A MIRROR MATCH — both fighters picked the same
 * character — would stack them on top of each other, so the second fighter
 * mirrors to the other side.
 *
 * This lives outside the 3D module on purpose: the arena HUD needs the same
 * numbers to anchor its damage readouts, and importing them from the 3D
 * layer would drag three.js into the main bundle.
 */

/** World X of each slot on the stage. */
const STAGE_SLOT_LEFT = -2.35;
const STAGE_SLOT_RIGHT = 2.35;

/** Stage-% that lines up with each slot under the arena camera. */
const SLOT_ANCHOR_X: Record<number, number> = {
  [STAGE_SLOT_LEFT]: 28,
  [STAGE_SLOT_RIGHT]: 73,
};

export type StageSide = "creator" | "challenger";

/** Which side of the stage a fighter stands on. */
export function stageSide(
  side: StageSide,
  fighterClass: FighterClass,
  foeClass?: FighterClass,
): "left" | "right" {
  const base: "left" | "right" =
    fighterClass === "chog_princess" ? "left" : "right";
  if (!foeClass || foeClass !== fighterClass) return base;
  /* mirror match: the creator takes the opposite side from the challenger */
  if (side === "creator") return base === "left" ? "right" : "left";
  return base;
}

/** World X of a fighter's slot on the stage. */
export function stageSlot(
  side: StageSide,
  fighterClass: FighterClass,
  foeClass?: FighterClass,
): number {
  return stageSide(side, fighterClass, foeClass) === "left"
    ? STAGE_SLOT_LEFT
    : STAGE_SLOT_RIGHT;
}

/** Stage-% that matches a fighter's slot — anchors the damage numbers. */
export function stageAnchorX(
  side: StageSide,
  fighterClass: FighterClass,
  foeClass?: FighterClass,
): number {
  return SLOT_ANCHOR_X[stageSlot(side, fighterClass, foeClass)] ?? 50;
}
