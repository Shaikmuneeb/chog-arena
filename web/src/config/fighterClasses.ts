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

export type FighterRosterEntry = {
  /** Strict character id — the only key used to resolve this fighter. */
  id: FighterClass;
  /** Display name for the roster card. */
  name: string;
  /** The character's designated source design MP4. */
  video: string;
  /** Signature move name used by the combat commentary feed. */
  style: string;
  /** Hardcoded stake price for this fighter's arena challenge. */
  price: string;
};

/**
 * THE ROSTER — an explicit, static object array. Every entry is bound to its
 * own character id, its own designated asset and its own price. Nothing here
 * is ever resolved by array index, so an image can never shift onto the
 * wrong fighter.
 */
export const FIGHTER_ROSTER: readonly FighterRosterEntry[] = [
  {
    id: "chogzila",
    name: "Warlord Chogzila",
    video: "/fighters/new chogzilla design.mp4",
    style: "Atomic Plasma Breath",
    price: "2.5 MON",
  },
  {
    id: "chog_samurai",
    name: "Chog Samurai",
    video: "/fighters/chog samuri new design.mp4",
    style: "Thunderstrike Flash",
    price: "0.5 MON",
  },
  {
    id: "void_lord_james",
    name: "Void Lord James",
    video: "/fighters/new design void lord james.mp4",
    style: "Void Dimension Cleave",
    price: "1 MON",
  },
  {
    id: "crimson_lord_benja",
    name: "Crimson Lord Benja",
    video: "/fighters/crimson lord benja.mp4",
    style: "Crimson Hellfire Combo",
    price: "0.1 MON",
  },
  {
    id: "lady_chog",
    name: "Lady Chog",
    video: "/fighters/new design lady chog.mp4",
    style: "Phantom Blade Dance",
    price: "1.5 MON",
  },
  {
    id: "chog_princess",
    name: "Chog Princess",
    video: "/fighters/chog princess new design.mp4",
    style: "Supernova Astral Beam",
    price: "1.2 MON",
  },
];

/** Roster lookup BY ID — never by array position. */
export const FIGHTER_ROSTER_BY_ID: Record<FighterClass, FighterRosterEntry> =
  Object.fromEntries(
    FIGHTER_ROSTER.map((entry) => [entry.id, entry]),
  ) as Record<FighterClass, FighterRosterEntry>;

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
  chogzila: {
    label: "Chogzilla",
    profileLabel: "Warlord Chogzilla",
    blurb: "Spiky crimson armor + giant battle axe",
    primary: "#dc2626",
    secondary: "#fbbf24",
    dark: "#7f1d1d",
  },
  chog_samurai: {
    label: "Chog Samurai",
    profileLabel: "Chog Samurai",
    blurb: "Cyber-monad samurai + glowing katana",
    primary: "#7c3aed",
    secondary: "#c4b5fd",
    dark: "#3b0764",
  },
  void_lord_james: {
    label: "Void Lord James",
    profileLabel: "Void Lord James",
    blurb: "Close-range VOID CLAW SLAM + jagged void lightning",
    primary: "#4c1d95",
    secondary: "#22d3ee",
    dark: "#1e1b4b",
  },
  crimson_lord_benja: {
    label: "Crimson Lord Benja",
    profileLabel: "Crimson Lord Benja",
    blurb: "Crimson lord armor + heavy blade",
    primary: "#991b1b",
    secondary: "#f87171",
    dark: "#450a0a",
  },
  lady_chog: {
    label: "Lady Chog",
    profileLabel: "Lady Chog",
    blurb: "Royal chog garb + elegant strikes",
    primary: "#be185d",
    secondary: "#f9a8d4",
    dark: "#500724",
  },
  chog_princess: {
    label: "Chog Princess",
    profileLabel: "Chog Princess",
    blurb: "Princess chog regalia + radiant magic",
    primary: "#7c3aed",
    secondary: "#e9d5ff",
    dark: "#3b0764",
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
