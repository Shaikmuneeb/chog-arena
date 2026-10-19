export type FighterClass =
  | "chogzila"
  | "chog_samurai"
  | "void_lord_james"
  | "crimson_lord_benja"
  | "lady_chog"
  | "chog_princess";

export const FIGHTER_CLASSES: FighterClass[] = [
  "chogzila",
  "chog_samurai",
  "void_lord_james",
  "crimson_lord_benja",
  "lady_chog",
  "chog_princess",
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
    /** Unique static portrait for this character — never shared. */
    portrait: string;
  }
> = {
  chogzila: {
    label: "Chogzilla",
    profileLabel: "Warlord Chogzilla",
    blurb: "Spiky crimson armor + giant battle axe",
    primary: "#dc2626",
    secondary: "#fbbf24",
    dark: "#7f1d1d",
    portrait: "/fighters/portraits/chogzila.png",
  },
  chog_samurai: {
    label: "Chog Samurai",
    profileLabel: "Chog Samurai",
    blurb: "Cyber-monad samurai + glowing katana",
    primary: "#7c3aed",
    secondary: "#c4b5fd",
    dark: "#3b0764",
    portrait: "/fighters/portraits/chog_samurai.png",
  },
  void_lord_james: {
    label: "Void Lord James",
    profileLabel: "Void Lord James",
    blurb: "Close-range VOID CLAW SLAM + jagged void lightning",
    primary: "#4c1d95",
    secondary: "#22d3ee",
    dark: "#1e1b4b",
    portrait: "/fighters/portraits/void_lord_james.png",
  },
  crimson_lord_benja: {
    label: "Crimson Lord Benja",
    profileLabel: "Crimson Lord Benja",
    blurb: "Crimson lord armor + heavy blade",
    primary: "#991b1b",
    secondary: "#f87171",
    dark: "#450a0a",
    portrait: "/fighters/portraits/crimson_lord_benja.png",
  },
  lady_chog: {
    label: "Lady Chog",
    profileLabel: "Lady Chog",
    blurb: "Royal chog garb + elegant strikes",
    primary: "#be185d",
    secondary: "#f9a8d4",
    dark: "#500724",
    portrait: "/fighters/portraits/lady_chog.png",
  },
  chog_princess: {
    label: "Chog Princess",
    profileLabel: "Chog Princess",
    blurb: "Princess chog regalia + radiant magic",
    primary: "#7c3aed",
    secondary: "#e9d5ff",
    dark: "#3b0764",
    portrait: "/fighters/portraits/chog_princess.png",
  },
};

export function isFighterClass(value: unknown): value is FighterClass {
  return (
    typeof value === "string" && (FIGHTER_CLASSES as string[]).includes(value)
  );
}

/** Migrates legacy (pre-rename) class ids stored in old profiles. */
export function migrateFighterClass(value: unknown): FighterClass {
  if (isFighterClass(value)) return value;
  const legacy: Record<string, FighterClass> = {
    berserker: "chogzila",
    samurai: "chog_samurai",
    mage: "void_lord_james",
    benja: "crimson_lord_benja",
    ladychog: "lady_chog",
    princess: "chog_princess",
    "void-james": "void_lord_james",
  };
  return legacy[value as string] ?? "chogzila";
}
