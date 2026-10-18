import type { FighterClass } from "@/config/fighterClasses";

export interface SpecialMove {
  id: string;
  name: string;
  damage: [number, number]; // [min, max]
  hitCount: number;
  vfxType: "slash" | "magma" | "laser" | "void_rift";
  screenShake: boolean;
  soundCue: string;
}

export interface FighterMoveSet {
  id: string;
  name: string;
  classBadge: string;
  idleFrames: number;
  attackFrames: number;
  signatureMove: SpecialMove;
  criticalArt: SpecialMove;
}

export const FIGHTER_MOVES: Record<string, FighterMoveSet> = {
  berserker: {
    id: "berserker",
    name: "Warlord Chogzilla",
    classBadge: "Arena Executioner",
    idleFrames: 4,
    attackFrames: 6,
    signatureMove: {
      id: "magma_pound",
      name: "Magma Eruption Ground Pound",
      damage: [16, 25],
      hitCount: 4,
      vfxType: "magma",
      screenShake: true,
      soundCue: "heavy_slam",
    },
    criticalArt: {
      id: "chogzilla_wrath",
      name: "Apocalyptic Inferno Smash",
      damage: [38, 48],
      hitCount: 6,
      vfxType: "magma",
      screenShake: true,
      soundCue: "volcano_boom",
    },
  },
  samurai: {
    id: "samurai",
    name: "Chog Samurai",
    classBadge: "Samurai of Monad",
    idleFrames: 4,
    attackFrames: 6,
    signatureMove: {
      id: "plasma_crescent",
      name: "Plasma Blade Crescent",
      damage: [15, 23],
      hitCount: 3,
      vfxType: "slash",
      screenShake: true,
      soundCue: "katana_slash",
    },
    criticalArt: {
      id: "thousand_cuts",
      name: "Monad Flash Execution",
      damage: [36, 46],
      hitCount: 10,
      vfxType: "slash",
      screenShake: true,
      soundCue: "speed_slash",
    },
  },
  "void-james": {
    id: "void-james",
    name: "Void Lord James",
    classBadge: "Abyssal Executioner",
    idleFrames: 4,
    attackFrames: 6,
    signatureMove: {
      id: "void_gravity",
      name: "Void Rift Gravity Crush",
      damage: [18, 26],
      hitCount: 4,
      vfxType: "void_rift",
      screenShake: true,
      soundCue: "void_roar",
    },
    criticalArt: {
      id: "abyssal_singularity",
      name: "Singularity Overdrive",
      damage: [40, 52],
      hitCount: 7,
      vfxType: "void_rift",
      screenShake: true,
      soundCue: "blackhole_boom",
    },
  },
  benja: {
    id: "benja",
    name: "Crimson Lord Benja",
    classBadge: "Crimson Lord",
    idleFrames: 4,
    attackFrames: 6,
    signatureMove: {
      id: "crimson_slash",
      name: "Crimson Blade Cleave",
      damage: [17, 25],
      hitCount: 3,
      vfxType: "slash",
      screenShake: true,
      soundCue: "katana_slash",
    },
    criticalArt: {
      id: "crimson_overdrive",
      name: "Crimson Apocalypse",
      damage: [39, 49],
      hitCount: 8,
      vfxType: "magma",
      screenShake: true,
      soundCue: "volcano_boom",
    },
  },
  ladychog: {
    id: "ladychog",
    name: "Lady Chog",
    classBadge: "Royal Chog",
    idleFrames: 4,
    attackFrames: 6,
    signatureMove: {
      id: "royal_strike",
      name: "Royal Grace Strike",
      damage: [15, 23],
      hitCount: 3,
      vfxType: "slash",
      screenShake: true,
      soundCue: "katana_slash",
    },
    criticalArt: {
      id: "royal_bloom",
      name: "Royal Bloom Barrage",
      damage: [37, 47],
      hitCount: 7,
      vfxType: "laser",
      screenShake: true,
      soundCue: "critical_beam",
    },
  },
  princess: {
    id: "princess",
    name: "Chog Princess",
    classBadge: "Chog Princess",
    idleFrames: 4,
    attackFrames: 6,
    signatureMove: {
      id: "radiant_burst",
      name: "Radiant Princess Burst",
      damage: [16, 24],
      hitCount: 4,
      vfxType: "laser",
      screenShake: true,
      soundCue: "laser_burst",
    },
    criticalArt: {
      id: "princess_nova",
      name: "Princess Nova",
      damage: [38, 50],
      hitCount: 9,
      vfxType: "void_rift",
      screenShake: true,
      soundCue: "blackhole_boom",
    },
  },
};

/** Internal FighterClass keys → FIGHTER_MOVES ids. */
const CLASS_MOVESET_ID: Record<FighterClass, string> = {
  berserker: "berserker",
  samurai: "samurai",
  mage: "void-james",
  benja: "benja",
  ladychog: "ladychog",
  princess: "princess",
};

export function getFighterMoveSet(cls: FighterClass): FighterMoveSet {
  return FIGHTER_MOVES[CLASS_MOVESET_ID[cls]] ?? FIGHTER_MOVES.berserker;
}

/** Map named sound cues onto the existing arenaAudio impact types. */
export type ImpactCue = "slash" | "crit" | "slam";

const SOUND_CUE_MAP: Record<string, ImpactCue> = {
  laser_burst: "slam",
  critical_beam: "crit",
  heavy_slam: "slam",
  volcano_boom: "slam",
  katana_slash: "slash",
  speed_slash: "crit",
  void_roar: "slam",
  blackhole_boom: "slam",
};

export function impactCueFor(soundCue: string): ImpactCue {
  return SOUND_CUE_MAP[soundCue] ?? "slam";
}

/** Combat-log emoji per VFX type. */
export const MOVE_EMOJI: Record<SpecialMove["vfxType"], string> = {
  void_rift: "💜🔥",
  laser: "🌀⚡",
  magma: "🌋",
  slash: "⚔️🌙",
};
