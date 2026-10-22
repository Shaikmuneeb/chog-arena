import type { FighterClass } from "./fighterClasses";

/**
 * Every animation a fighter can be driven into. Each one maps to a
 * dedicated Mixamo clip on the rigged model.
 */
export type FighterActionState =
  | "idle"
  | "lightAttack"
  | "heavyAttack"
  | "special"
  | "critical"
  | "block"
  | "hit"
  | "ko"
  | "victory";

export type Fighter3DConfig = {
  /** Character id this model belongs to. */
  id: FighterClass;
  /** Folder under /new fighters design holding this character's assets. */
  dir: string;
  /**
   * Skin texture PNG, relative to the character folder. The FBX itself points
   * at a `*.fbm/<file>.png` path that does not exist next to it, so this
   * texture is applied manually to the loaded materials.
   */
  texture: string;
  /** One FBX animation clip per action state. */
  clips: Record<FighterActionState, string>;
};

/**
 * 3D model bindings. Only the fighters that ship a rigged Meshy AI model are
 * listed here — everyone else keeps the 2D sprite treatment.
 */
export const FIGHTER_3D: Partial<Record<FighterClass, Fighter3DConfig>> = {
  void_lord_james: {
    id: "void_lord_james",
    dir: "james",
    texture: "Meshy_AI_Voidstone_Warlord_1019191401_texture.png",
    clips: {
      idle: "Mutant Flexing Muscles.fbx",
      lightAttack: "Mutant Punch.fbx",
      heavyAttack: "Punch To Elbow Combo.fbx",
      special: "Double Leg Takedown - Attacker.fbx",
      critical: "Double Leg Takedown - Attacker.fbx",
      block: "Center Block.fbx",
      hit: "Hit To Body.fbx",
      ko: "Knocked Out.fbx",
      victory: "Robot Hip Hop Dance.fbx",
    },
  },
  chog_princess: {
    id: "chog_princess",
    dir: "princess",
    texture: "Meshy_AI_Violet_Valkyrie_1019202515_texture.png",
    clips: {
      idle: "Mma Idle.fbx",
      lightAttack: "Combo Punch.fbx",
      heavyAttack: "Armada.fbx",
      special: "Medium Hit To Head.fbx",
      critical: "Brutal Assassination.fbx",
      block: "Body Block.fbx",
      hit: "Light Hit To Head.fbx",
      /* she ships no knock-out clip — the hard hit is held as the K.O. pose */
      ko: "Medium Hit To Head.fbx",
      victory: "Victory Idle.fbx",
    },
  },
};

/** 3D binding for a fighter, or null when the character has no model. */
export function fighter3DConfig(id: FighterClass): Fighter3DConfig | null {
  return FIGHTER_3D[id] ?? null;
}

/** True when the character can be rendered as a 3D fighter. */
export function has3DModel(id: FighterClass): boolean {
  return Boolean(FIGHTER_3D[id]);
}

/**
 * The active roster — the only two characters that ship a rigged model, so
 * every duel in the arena is a full 3D Mixamo fight. Void Lord James takes
 * the left, Chog Princess the right.
 */
export const BATTLE_ROSTER: readonly FighterClass[] = [
  "void_lord_james",
  "chog_princess",
];

/**
 * Default fighter class for a player with no saved profile. It MUST be a
 * character that ships a 3D model — a legacy class would render an empty
 * slot in the VS screen and on the profile card.
 */
export const DEFAULT_FIGHTER_CLASS: FighterClass = "void_lord_james";

/**
 * The characters that ship a rigged 3D model.
 *
 * A duel is always fought between two DIFFERENT characters: a mirror match
 * would load two identical models, two identical stat lines and two
 * identical nameplates.
 */
export const MODEL_ROSTER: readonly FighterClass[] = [
  "void_lord_james",
  "chog_princess",
];

/**
 * Resolve the fighter for one side of a duel against the other side.
 *
 * The preferred pick wins whenever it is a character that actually has a
 * model AND it is not the opponent — that is the player's own choice and
 * it is respected. Otherwise the other 3D character is used, so the two
 * sides can never end up loading the same rig.
 */
export function pickOpposingFighter(
  preferred: FighterClass | undefined,
  opponent: FighterClass,
): FighterClass {
  if (preferred && preferred !== opponent && has3DModel(preferred)) {
    return preferred;
  }
  return opponent === "void_lord_james" ? "chog_princess" : "void_lord_james";
}
