import type { FighterClass } from "./fighterClasses";

/** The fight states a 3D fighter can be driven into. */
export type Fighter3DState =
  | "idle"
  | "attack"
  | "hit"
  | "block"
  | "ko"
  | "victory";

export type Fighter3DConfig = {
  /** Character id this model belongs to. */
  id: FighterClass;
  /** Folder under /models holding this character's assets. */
  dir: string;
  /**
   * Skin texture PNG, relative to the character folder. The FBX itself points
   * at a `*.fbm/<file>.png` path that does not exist next to it, so this
   * texture is applied manually to the loaded materials.
   */
  texture: string;
  /** One FBX animation clip per fight state. */
  clips: Record<Fighter3DState, string>;
};

/**
 * 3D model bindings. Only the fighters that ship a rigged Meshy AI model are
 * listed here — everyone else keeps the 2D sprite/GIF treatment.
 */
export const FIGHTER_3D: Partial<Record<FighterClass, Fighter3DConfig>> = {
  chog_princess: {
    id: "chog_princess",
    dir: "chog_princess",
    texture:
      "Meshy_AI_Violet_Valkyrie_1019202515_texture_obj/Meshy_AI_Violet_Valkyrie_1019202515_texture.png",
    clips: {
      idle: "Mma Idle.fbx",
      attack: "Combo Punch.fbx",
      hit: "Medium Hit To Head.fbx",
      block: "Body Block.fbx",
      ko: "Brutal Assassination.fbx",
      victory: "Victory Idle.fbx",
    },
  },
  void_lord_james: {
    id: "void_lord_james",
    dir: "void_lord_james",
    texture:
      "Meshy_AI_Voidstone_Warlord_1019191401_texture_obj/Meshy_AI_Voidstone_Warlord_1019191401_texture.png",
    clips: {
      idle: "Mutant Flexing Muscles.fbx",
      attack: "Mutant Punch.fbx",
      hit: "Hit To Body.fbx",
      block: "Center Block.fbx",
      ko: "Knocked Out.fbx",
      victory: "Robot Hip Hop Dance.fbx",
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
