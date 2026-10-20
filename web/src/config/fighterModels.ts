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
      ko: "Brutal Assassination.fbx",
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
