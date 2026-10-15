export type FighterClass = "berserker" | "ronin" | "mage" | "juggernaut";

export const FIGHTER_CLASSES: FighterClass[] = [
  "berserker",
  "ronin",
  "mage",
  "juggernaut",
];

export const FIGHTER_CLASS_META: Record<
  FighterClass,
  {
    label: string;
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
  ronin: {
    label: "Ronin",
    blurb: "Cyber-monad samurai + glowing katana",
    primary: "#7c3aed",
    secondary: "#c4b5fd",
    dark: "#3b0764",
  },
  mage: {
    label: "Mage",
    blurb: "Dark hooded mystic + lightning staff",
    primary: "#4c1d95",
    secondary: "#22d3ee",
    dark: "#1e1b4b",
  },
  juggernaut: {
    label: "Juggernaut",
    blurb: "Heavy mecha-knight + plasma warhammer",
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
