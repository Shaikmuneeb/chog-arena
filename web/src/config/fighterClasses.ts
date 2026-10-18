export type FighterClass =
  | "berserker"
  | "samurai"
  | "mage"
  | "benja"
  | "ladychog"
  | "princess";

export const FIGHTER_CLASSES: FighterClass[] = [
  "berserker",
  "samurai",
  "mage",
  "benja",
  "ladychog",
  "princess",
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
    /** Static sprite sheet used for the in-arena fighter. */
    sprite: string;
  }
> = {
  berserker: {
    label: "Chogzilla",
    profileLabel: "Warlord Chogzilla",
    blurb: "Spiky crimson armor + giant battle axe",
    primary: "#dc2626",
    secondary: "#fbbf24",
    dark: "#7f1d1d",
    sprite: "/assets/chog-slash.png",
  },
  samurai: {
    label: "Chog Samurai",
    profileLabel: "Chog Samurai",
    blurb: "Cyber-monad samurai + glowing katana",
    primary: "#7c3aed",
    secondary: "#c4b5fd",
    dark: "#3b0764",
    sprite: "/assets/chog-samurai.png",
  },
  mage: {
    label: "Void Lord James",
    profileLabel: "Void Lord James",
    blurb: "Close-range VOID CLAW SLAM + jagged void lightning",
    primary: "#4c1d95",
    secondary: "#22d3ee",
    dark: "#1e1b4b",
    sprite: "/assets/void-james.png",
  },
  benja: {
    label: "Crimson Lord Benja",
    profileLabel: "Crimson Lord Benja",
    blurb: "Crimson lord armor + heavy blade",
    primary: "#991b1b",
    secondary: "#f87171",
    dark: "#450a0a",
    sprite: "/assets/chog-slash.png",
  },
  ladychog: {
    label: "Lady Chog",
    profileLabel: "Lady Chog",
    blurb: "Royal chog garb + elegant strikes",
    primary: "#be185d",
    secondary: "#f9a8d4",
    dark: "#500724",
    sprite: "/assets/chog-samurai.png",
  },
  princess: {
    label: "Chog Princess",
    profileLabel: "Chog Princess",
    blurb: "Princess chog regalia + radiant magic",
    primary: "#7c3aed",
    secondary: "#e9d5ff",
    dark: "#3b0764",
    sprite: "/assets/keone-mage.png",
  },
};

export function isFighterClass(value: unknown): value is FighterClass {
  return (
    typeof value === "string" && (FIGHTER_CLASSES as string[]).includes(value)
  );
}
