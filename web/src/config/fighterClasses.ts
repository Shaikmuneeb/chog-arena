export type FighterClass = "berserker" | "samurai" | "mage" | "juggernaut";

export const FIGHTER_CLASSES: FighterClass[] = [
  "berserker",
  "samurai",
  "mage",
  "juggernaut",
];

export const FIGHTER_CLASS_META: Record<
  FighterClass,
  {
    /** Compact badge label (HUD chips, VS cards). */
    label: string;
    /** Optional longer display name for the profile class picker. */
    profileLabel?: string;
    blurb: string;
    /** Main armor color. */
    primary: string;
    /** Weapon / trim glow color. */
    secondary: string;
    /** Dark armor shade. */
    dark: string;
  }
> = {
  berserker: {
    label: "Berserker",
    blurb: "Spiky crimson armor + giant battle axe",
    primary: "#dc2626",
    secondary: "#fbbf24",
    dark: "#7f1d1d",
  },
  samurai: {
    label: "Chog Samurai",
    blurb: "Cyber-monad samurai + glowing katana",
    primary: "#7c3aed",
    secondary: "#c4b5fd",
    dark: "#3b0764",
  },
  mage: {
    label: "Void James",
    profileLabel: "Void Lord James",
    blurb: "Close-range VOID CLAW SLAM + jagged void lightning",
    primary: "#4c1d95",
    secondary: "#22d3ee",
    dark: "#1e1b4b",
  },
  juggernaut: {
    label: "Cyber Mage",
    profileLabel: "Keone Mage",
    blurb: "Holographic portals + DIGITAL SLAM lightning bursts",
    primary: "#64748b",
    secondary: "#38bdf8",
    dark: "#1e293b",
  },
};

export function isFighterClass(value: unknown): value is FighterClass {
  return (
    typeof value === "string" && (FIGHTER_CLASSES as string[]).includes(value)
  );
}
