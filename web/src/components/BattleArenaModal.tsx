"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ExternalLink, Loader2, Swords } from "lucide-react";
import { useFighterProfile } from "@/context/FighterProfileContext";
import type { FighterClass } from "@/config/fighterClasses";
import { FIGHTER_CLASS_META } from "@/config/fighterClasses";
import type { SpriteState } from "./FighterSprite";

import {
  getFighterMoveSet,
  impactCueFor,
  type SpecialMove,
} from "@/data/fighterMoves";
import { cn, formatMon, truncateAddress } from "@/lib/utils";
import { ChromaVideo, type FighterPose } from "./ChromaVideo";
import {
  playDashSfx,
  playHitSfx,
  playImpactSfx,
  playRoundAnnouncement,
  playSecondWindSfx,
  resetArenaAudio,
  stopArenaAudio,
} from "@/utils/arenaAudio";

export type DuelOutcome = {
  duelId: number;
  userWon: boolean;
  /** Second Wind roll fired in this duel (either fighter). */
  secondWind: boolean;
  /** The connected fighter was the one resurrected. */
  userResurrected: boolean;
  wager: bigint;
  pot: bigint;
  /** Actual winner payout from DuelResolved (0 when the user lost). */
  payout: bigint;
  txHash?: `0x${string}`;
  winnerAddress: `0x${string}`;
  loserAddress: `0x${string}`;
  /** Address of the fighter resurrected by Second Wind. */
  resurrectedAddress?: `0x${string}`;
};

/** One side of the battle: identity + full-body fighter class. */
export function ChromaFighter({
  fighterClass,
  state = "idle",
  facing = "right",
  size = 160,
  animKey,
  leanDir = null,
  isBlocking = false,
  activeMoveName = null,
  className,
  moveDir = 0,
}: {
  fighterClass: FighterClass;
  state?: SpriteState;
  facing?: "left" | "right";
  size?: number;
  animKey?: number | string;
  leanDir?: "forward" | "retreat" | null;
  isBlocking?: boolean;
  activeMoveName?: string | null;
  className?: string;
  moveDir?: number;
}) {
  const theme = FIGHTER_CLASS_META[fighterClass];
  const videoSrc = theme.sprite;
  const leanClass =
    leanDir === "forward"
      ? "fighter-lean-forward"
      : leanDir === "retreat"
        ? "fighter-lean-retreat"
        : isBlocking
          ? "assist-block"
          : "";

  const fighterPose: FighterPose =
    isBlocking || state === "hit" || state === "stagger"
      ? "guard"
      : moveDir < 0
        ? "guard"
        : moveDir > 0 || state === "attack" || state === "dashIn"
          ? "attack"
          : "stance";

  let transform = "translateY(0px) scale(1)";
  let transition = "transform 120ms ease-out";
  let filter = "none";
  if (isBlocking) {
    transform = "scaleY(0.92) translateY(8px)";
    transition = "transform 120ms ease-out";
  } else if (state === "hit" || state === "stagger") {
    transform = "translateX(-18px) scale(1)";
    transition = "transform 150ms ease-out";
    filter = "brightness(1.5) drop-shadow(0 0 12px red)";
  } else if (state === "dead") {
    transform = "translateY(30px) rotate(-75deg)";
    transition = "transform 400ms ease-out";
    filter = "grayscale(1) brightness(0.7)";
  } else if (state === "attack" || state === "dashIn") {
    if (activeMoveName) {
      transform = "translateX(85px) translateY(-25px) rotate(18deg) scale(1.15)";
    } else {
      transform = "translateX(55px) rotate(10deg)";
    }
    transition = "transform 90ms ease-out";
  } else if (state === "dashOut") {
    transform = "translateX(-12px) scale(1)";
    transition = "transform 120ms ease-out";
  } else if (moveDir < 0) {
    transform = "rotate(-6deg) translateY(-6px)";
    transition = "transform 120ms ease-out";
  } else if (moveDir > 0) {
    transform = "rotate(8deg) scaleX(1.04) translateY(-4px)";
    transition = "transform 120ms ease-out";
  } else if (state === "victory") {
    transform = "translateY(-8px) scale(1.05)";
    transition = "transform 200ms ease-out";
  }
  const motionStyle = {
    transform,
    transition,
    filter,
    transformOrigin: "bottom center",
    opacity: state === "dead" ? 0.7 : 1,
  };
  return (
    <div
      key={animKey ?? "static"}
      className={cn(
        "sprite-pixelated relative inline-block select-none opacity-100",
        facing === "left" && "sprite-mirror",
        className,
      )}
      style={{ height: size, lineHeight: 0 }}
      aria-hidden
    >
      <div
        className={cn("relative will-change-transform", leanClass, state === "idle" && "procedural-idle-breathe")}
        style={motionStyle}
      >
        <ChromaVideo src={videoSrc} pose={fighterPose} size={size} />
        {isBlocking && (
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2"
            style={{
              clipPath:
                "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
              background: "rgba(34,211,238,0.25)",
              border: "2px solid rgba(34,211,238,0.8)",
              boxShadow: "0 0 20px rgba(34,211,238,0.6)",
            }}
          />
        )}
      </div>
    </div>
  );
}

function FistFx({ x }: { x: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[25]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="absolute h-12 w-12 rounded-full border-2 border-rose-400/80"
          style={{
            left: `${x}%`,
            top: "52%",
            transform: `translate(-50%, -50%) scale(${1 + i * 0.3})`,
            opacity: 0.8 - i * 0.25,
            boxShadow: "0 0 18px rgba(244,63,94,0.8)",
          }}
        />
      ))}
    </div>
  );
}

function OrbFx({ x }: { x: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[25]" aria-hidden>
      <div
        className="absolute h-16 w-16 rounded-full"
        style={{
          left: `${x}%`,
          top: "52%",
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle, rgba(255,255,255,0.95), rgba(232,121,249,0.8) 40%, rgba(168,85,247,0.4) 70%, transparent 80%)",
          boxShadow: "0 0 30px rgba(232,121,249,0.9)",
        }}
      />
    </div>
  );
}

function BreathFx({ x }: { x: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[25]" aria-hidden>
      <div
        className="absolute h-10 w-72"
        style={{
          left: `${x - 36}%`,
          top: "52%",
          background:
            "linear-gradient(90deg, rgba(249,115,22,0.9), rgba(239,68,68,0.7) 50%, transparent)",
          boxShadow: "0 0 24px rgba(249,115,22,0.8)",
          borderRadius: "9999px",
        }}
      />
    </div>
  );
}

export type FighterDescriptor = {
  address: `0x${string}`;
  name: string;
  title?: string;
  fighterClass: FighterClass;
};

type FighterSide = "creator" | "challenger";
type PlayerSide = "left" | "right";
type Stage = "faceoff" | "roundintro" | "fight" | "ko" | "verdict";
type AttackKind = "light" | "heavy" | "special" | "critical";

/** Per-class visual scale — sheet art fills its frame very differently
 * (Chogzilla art is edge-to-edge; Keone/James art sits small in-frame). */
const CLASS_SIZE_SCALE: Record<FighterClass, number> = {
  berserker: 0.72,
  samurai: 0.92,
  mage: 1.1,
  benja: 0.85,
  ladychog: 0.9,
  princess: 0.9,
};

/** Class-specific neon afterimage trail colors (shadow clones). */
const CLASS_AFTERIMAGE_CONFIG: Record<
  FighterClass,
  { name: string; color: string; glow: string }
> = {
  berserker: {
    name: "Warlord Chogzilla",
    color: "#f97316",
    glow: "rgba(249, 115, 22, 0.85)",
  },
  samurai: {
    name: "Chog Samurai",
    color: "#a855f7",
    glow: "rgba(168, 85, 247, 0.85)",
  },
  mage: {
    name: "Void Lord James",
    color: "#c084fc",
    glow: "rgba(192, 132, 252, 0.85)",
  },
  benja: {
    name: "Crimson Lord Benja",
    color: "#ef4444",
    glow: "rgba(239, 68, 68, 0.85)",
  },
  ladychog: {
    name: "Lady Chog",
    color: "#f472b6",
    glow: "rgba(244, 114, 182, 0.85)",
  },
  princess: {
    name: "Chog Princess",
    color: "#c084fc",
    glow: "rgba(192, 132, 252, 0.85)",
  },
};

function stageSize(f: FighterDescriptor, narrow = false): number {
  /* Narrow viewports (< 640px) scale both fighters down proportionally so
   * there is room to dash and trade combos cleanly on a phone. */
  return Math.round(
    225 * (CLASS_SIZE_SCALE[f.fighterClass] ?? 1) * (narrow ? 0.68 : 1),
  );
}

/* ------------------------------------------------------------------ tuning */

const MOVE_SPEED = 24; // %/s player slide speed
const AI_APPROACH_SPEED = 24; // %/s AI closes distance aggressively
const AI_BACKSTEP_SPEED = 18; // %/s AI retreats

/** Per-archetype movement speed (%/s). */
const FIGHTER_SPEED: Record<FighterClass, number> = {
  berserker: 14,
  samurai: 24,
  mage: 18,
  benja: 34,
  ladychog: 26,
  princess: 20,
};

/** Per-archetype windup timings (ms). */
const WINDUP_FOR: Record<FighterClass, Record<AttackKind, number>> = {
  berserker: { light: 160, heavy: 400, special: 420, critical: 500 },
  samurai: { light: 110, heavy: 220, special: 300, critical: 380 },
  mage: { light: 150, heavy: 260, special: 320, critical: 400 },
  benja: { light: 90, heavy: 180, special: 260, critical: 320 },
  ladychog: { light: 100, heavy: 200, special: 280, critical: 360 },
  princess: { light: 120, heavy: 220, special: 300, critical: 380 },
};
const RECOVER_FOR: Record<FighterClass, Record<AttackKind, number>> = {
  berserker: { light: 220, heavy: 420, special: 360, critical: 440 },
  samurai: { light: 140, heavy: 240, special: 280, critical: 340 },
  mage: { light: 180, heavy: 260, special: 300, critical: 360 },
  benja: { light: 100, heavy: 200, special: 260, critical: 320 },
  ladychog: { light: 120, heavy: 220, special: 280, critical: 340 },
  princess: { light: 140, heavy: 240, special: 300, critical: 360 },
};
const LUNGE_SPEED = 12; // %/s forward lunge during an attack windup
const WINDUP: Record<AttackKind, number> = {
  light: 120,
  heavy: 240,
  special: 300,
  critical: 380,
};
const RECOVER: Record<AttackKind, number> = {
  light: 150,
  heavy: 240,
  special: 280,
  critical: 340,
};
/** Center-to-center reach (stage %) for each attack. */
const REACH: Record<AttackKind, number> = {
  light: 28,
  heavy: 32,
  special: 34,
  critical: 36,
};
const MOVE_FX_MS: Record<SpecialMove["vfxType"], number> = {
  void_rift: 650,
  laser: 750,
  magma: 750,
  slash: 800,
  fist: 600,
  orb: 700,
  breath: 900,
};
/** Horizontal tracks each fighter is confined to (stage %). */
const TRACK_LEFT: [number, number] = [10, 42];
const TRACK_RIGHT: [number, number] = [58, 90];

function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}
function clamp(v: number, [lo, hi]: [number, number]): number {
  return Math.min(hi, Math.max(lo, v));
}
function playerTrack(playerSide: PlayerSide): [number, number] {
  return playerSide === "left" ? TRACK_LEFT : TRACK_RIGHT;
}
function oppTrack(playerSide: PlayerSide): [number, number] {
  return playerSide === "left" ? TRACK_RIGHT : TRACK_LEFT;
}
function trackFor(side: FighterSide, playerSide: PlayerSide): [number, number] {
  return side === "challenger" ? playerTrack(playerSide) : oppTrack(playerSide);
}

/* ------------------------------------------------------------- match model */

type ActiveAttack = {
  kind: AttackKind;
  windup: number;
  recover: number;
  move: SpecialMove | null;
};

type FighterRT = {
  side: FighterSide;
  x: number;
  hp: number;
  meter: number;
  pose: SpriteState;
  seq: number;
  facing: "left" | "right";
  attack: ActiveAttack | null;
  blockHeld: boolean;
  hurtMs: number;
  hurtHeavy: boolean;
  hurtBright: boolean;
  shieldMs: number;
  down: boolean;
  stunMs: number;
  moveDir: number;
  toward: boolean;
  leanDir: "forward" | "retreat" | null;
  activeMoveName: string | null;
};

type AiAction =
  | { kind: "approach"; dur: number }
  | { kind: "block"; dur: number }
  | { kind: "backstep"; dur: number }
  | { kind: "telegraph"; attack: AttackKind; dur: number };

type HitRT = {
  id: number;
  side: FighterSide;
  dmg: number;
  crit: boolean;
  multi?: number;
  name?: string;
  ms: number;
};

type MatchState = {
  stage: Stage;
  stageMs: number;
  stageDur: number;
  round: 1 | 2 | 3;
  timer: number;
  orbs: Record<FighterSide, number>;
  fighters: Record<FighterSide, FighterRT>;
  moves: Record<FighterSide, ReturnType<typeof getFighterMoveSet>>;
  heldLeft: boolean;
  heldRight: boolean;
  heldBlock: boolean;
  attackQueued: AttackKind | null;
  aiNextMs: number;
  aiAction: AiAction | null;
  aiActionMs: number;
  shieldUsed: boolean;
  overdrive: boolean;
  buffs: { player: number; ai: number };
  fxId: number;
  impact: { id: number; x: number } | null;
  impactMs: number;
  dust: { id: number; x: number } | null;
  dustMs: number;
  hurtFx: { id: number; x: number; bright: boolean } | null;
  hurtFxMs: number;
  moveFx: {
    id: number;
    x: number;
    vfx: SpecialMove["vfxType"];
    kind: "special" | "critical";
  } | null;
  moveFxMs: number;
  cinematic: { id: number; kind: "critical" | "ko"; moveName?: string } | null;
  cinematicMs: number;
  combo: { id: number; count: number } | null;
  comboMs: number;
  camShakeMs: number;
  hitStopMs: number;
  guard: { id: number; x: number } | null;
  guardMs: number;
  shieldFx: { id: number; kind: "secondwind" | "overdrive" } | null;
  shieldFxMs: number;
  hits: HitRT[];
  dashSfxMs: number;
  banner: string | null;
  bannerMs: number;
  roundWinner: FighterSide | null;
  matchWinner: FighterSide | null;
};

type MatchScript = {
  playerWon: boolean;
  chainWinner: FighterSide;
  finalWinnerSide: FighterSide;
  loserSide: FighterSide;
  revivedSide: FighterSide | null;
  revivedWins: boolean;
  creatorClass: FighterClass;
  challengerClass: FighterClass;
};

function createMatch(script: MatchScript, playerSide: PlayerSide): MatchState {
  const playerX = playerSide === "left" ? 32 : 68;
  const oppX = playerSide === "left" ? 68 : 32;
  const playerFacing: "left" | "right" = playerSide === "left" ? "right" : "left";
  const oppFacing: "left" | "right" = playerSide === "left" ? "left" : "right";
   const blank = (side: FighterSide, x: number, facing: "left" | "right", hp = 100): FighterRT => ({
    side,
    x,
    hp,
    meter: 0,
    pose: "idle",
    seq: 0,
    facing,
    attack: null,
    blockHeld: false,
    hurtMs: 0,
    hurtHeavy: false,
    hurtBright: false,
    shieldMs: 0,
    down: false,
    stunMs: 0,
    moveDir: 0,
    toward: false,
    leanDir: null,
    activeMoveName: null,
  });
  return {
    stage: "faceoff",
    stageMs: 0,
    stageDur: 1000,
    round: 1,
    timer: 99,
    orbs: { creator: 0, challenger: 0 },
    fighters: {
      creator: blank("creator", oppX, oppFacing, script.creatorClass === "berserker" ? 130 : 100),
      challenger: blank("challenger", playerX, playerFacing, script.challengerClass === "berserker" ? 130 : 100),
    },
    moves: {
      creator: getFighterMoveSet(script.creatorClass),
      challenger: getFighterMoveSet(script.challengerClass),
    },
    heldLeft: false,
    heldRight: false,
    heldBlock: false,
    attackQueued: null,
    aiNextMs: 400,
    aiAction: null,
    aiActionMs: 0,
    shieldUsed: false,
    overdrive: false,
    buffs: { player: script.playerWon ? 1.5 : 0.9, ai: script.playerWon ? 0.75 : 1.35 },
    fxId: 0,
    impact: null,
    impactMs: 0,
    dust: null,
    dustMs: 0,
    hurtFx: null,
    hurtFxMs: 0,
    moveFx: null,
    moveFxMs: 0,
    cinematic: null,
    cinematicMs: 0,
    combo: null,
    comboMs: 0,
    camShakeMs: 0,
    hitStopMs: 0,
    guard: null,
    guardMs: 0,
    shieldFx: null,
    shieldFxMs: 0,
    hits: [],
    dashSfxMs: 0,
    banner: null,
    bannerMs: 0,
    roundWinner: null,
    matchWinner: null,
  };
}

/* ------------------------------------------------------------ view snapshot */

type FighterView = {
  x: number;
  hp: number;
  meter: number;
  pose: SpriteState;
  seq: number;
  facing: "left" | "right";
  blockHeld: boolean;
  hurtBright: boolean;
  down: boolean;
  shield: boolean;
  moveDir: number;
  toward: boolean;
  leanDir: "forward" | "retreat" | null;
  activeMoveName: string | null;
};

type View = {
  stage: Stage;
  round: 1 | 2 | 3;
  timer: number;
  banner: string | null;
  orbs: Record<FighterSide, number>;
  fighters: Record<FighterSide, FighterView>;
  impact: { id: number; x: number } | null;
  dust: { id: number; x: number } | null;
  hurtFx: { id: number; x: number; bright: boolean } | null;
  moveFx: {
    id: number;
    x: number;
    vfx: SpecialMove["vfxType"];
    kind: "special" | "critical";
  } | null;
  cinematic: { id: number; kind: "critical" | "ko"; moveName?: string } | null;
  combo: { id: number; count: number } | null;
  camShake: boolean;
  hitStop: boolean;
  guard: { id: number; x: number } | null;
  shieldFx: { id: number; kind: "secondwind" | "overdrive" } | null;
  hits: HitRT[];
  heldLeft: boolean;
  heldRight: boolean;
  heldBlock: boolean;
};

function fighterView(f: FighterRT): FighterView {
  return {
    x: Math.round(f.x * 10) / 10,
    hp: Math.round(f.hp),
    meter: Math.round(f.meter),
    pose: f.pose,
    seq: f.seq,
    facing: f.facing,
    blockHeld: f.blockHeld,
    hurtBright: f.hurtBright,
    down: f.down,
    shield: f.shieldMs > 0,
    moveDir: f.moveDir,
    toward: f.toward,
    leanDir: f.leanDir,
    activeMoveName: f.activeMoveName,
  };
}

function snapshot(m: MatchState): View {
  return {
    stage: m.stage,
    round: m.round,
    timer: Math.max(0, Math.ceil(m.timer)),
    banner: m.bannerMs > 0 ? m.banner : null,
    orbs: { ...m.orbs },
    fighters: {
      creator: fighterView(m.fighters.creator),
      challenger: fighterView(m.fighters.challenger),
    },
    impact: m.impactMs > 0 ? m.impact : null,
    dust: m.dustMs > 0 ? m.dust : null,
    hurtFx:
      m.hurtFxMs > 0
        ? { ...m.hurtFx!, bright: m.hurtFxMs > 290 }
        : null,
    moveFx: m.moveFxMs > 0 ? m.moveFx : null,
    cinematic: m.cinematicMs > 0 ? m.cinematic : null,
    combo: m.comboMs > 0 ? m.combo : null,
    camShake: m.camShakeMs > 0,
    hitStop: m.hitStopMs > 0,
    guard: m.guardMs > 0 ? m.guard : null,
    shieldFx: m.shieldFxMs > 0 ? m.shieldFx : null,
    hits: m.hits.filter((h) => h.ms > 0),
    heldLeft: m.heldLeft,
    heldRight: m.heldRight,
    heldBlock: m.heldBlock,
  };
}

/* ---------------------------------------------------------------- game loop */

function decayFx(m: MatchState, dt: number) {
  m.impactMs -= dt;
  if (m.impactMs <= 0) m.impact = null;
  m.dustMs -= dt;
  if (m.dustMs <= 0) m.dust = null;
  m.hurtFxMs -= dt;
  if (m.hurtFxMs <= 0) m.hurtFx = null;
  m.moveFxMs -= dt;
  if (m.moveFxMs <= 0) m.moveFx = null;
  m.cinematicMs -= dt;
  if (m.cinematicMs <= 0) m.cinematic = null;
  m.comboMs -= dt;
  if (m.comboMs <= 0) m.combo = null;
  m.camShakeMs -= dt;
  m.guardMs -= dt;
  if (m.guardMs <= 0) m.guard = null;
  m.shieldFxMs -= dt;
  if (m.shieldFxMs <= 0) m.shieldFx = null;
  m.bannerMs -= dt;
  if (m.bannerMs <= 0) m.banner = null;
  m.dashSfxMs -= dt;
  for (const h of m.hits) h.ms -= dt;
}

function refreshFighterPose(f: FighterRT) {
  let pose: SpriteState;
  if (f.down) pose = "dead";
  else if (f.shieldMs > 0) pose = "secondWind";
  else if (f.attack) pose = "attack";
  else if (f.hurtMs > 0) pose = f.hurtHeavy ? "stagger" : "hit";
  else if (f.stunMs > 0) pose = "idle";
  else if (f.moveDir !== 0) pose = f.toward ? "dashIn" : "dashOut";
  else pose = "idle";
  if (f.pose !== pose) {
    f.pose = pose;
    f.seq += 1;
  }
}

function tickFighter(f: FighterRT, dt: number) {
  if (f.hurtMs > 0) f.hurtMs -= dt;
  if (f.shieldMs > 0) f.shieldMs -= dt;
  if (f.stunMs > 0) f.stunMs -= dt;
  refreshFighterPose(f);
}

function startRound(
  m: MatchState,
  round: 1 | 2 | 3,
  script: MatchScript,
  playerSide: PlayerSide,
) {
  m.round = round;
  m.stage = "roundintro";
  m.stageMs = 0;
  m.stageDur = round === 1 ? 1300 : 1400;
  m.banner =
    round === 3 ? "ROUND 3 // FINAL ROUND!" : `ROUND ${round} // FIGHT!`;
  m.bannerMs = m.stageDur;
  playRoundAnnouncement(round);
  const p = m.fighters.challenger;
  const ai = m.fighters.creator;
  p.hp = 100;
  ai.hp = 100;
  p.down = false;
  ai.down = false;
  p.attack = null;
  ai.attack = null;
  p.hurtMs = 0;
  ai.hurtMs = 0;
  p.shieldMs = 0;
  ai.shieldMs = 0;
  p.stunMs = 0;
  ai.stunMs = 0;
  p.blockHeld = false;
  ai.blockHeld = false;
  p.x = playerSide === "left" ? 32 : 68;
  ai.x = playerSide === "left" ? 68 : 32;
  p.pose = "idle";
  ai.pose = "idle";
  p.seq += 1;
  ai.seq += 1;
  m.attackQueued = null;
  m.aiAction = null;
  m.aiActionMs = 0;
  m.aiNextMs = 800;
  m.impact = null;
  m.dust = null;
  m.hurtFx = null;
  m.moveFx = null;
  m.cinematic = null;
  m.combo = null;
  m.guard = null;
  m.shieldFx = null;
  m.hits = [];
  m.timer = 99;
}

function startKO(
  m: MatchState,
  winner: FighterSide,
  script: MatchScript,
  playerSide: PlayerSide,
) {
  m.roundWinner = winner;
  m.stage = "ko";
  m.stageMs = 0;
  m.stageDur = 1750;
  m.banner = `ROUND ${m.round} K.O.!`;
  m.bannerMs = 1750;
  const loser = winner === "challenger" ? m.fighters.creator : m.fighters.challenger;
  const win = winner === "challenger" ? m.fighters.challenger : m.fighters.creator;
  loser.down = true;
  loser.pose = "dead";
  loser.seq += 1;
  win.pose = "victory";
  win.seq += 1;
  m.cinematic = { id: ++m.fxId, kind: "ko" };
  m.cinematicMs = 750;
  playHitSfx();
}

function triggerSecondWind(m: MatchState, p: FighterRT) {
  m.shieldUsed = true;
  p.hp = 55;
  p.shieldMs = 2600;
  p.pose = "secondWind";
  p.seq += 1;
  m.shieldFx = { id: ++m.fxId, kind: "secondwind" };
  m.shieldFxMs = 1600;
  m.banner = "MONAD SECOND WIND // ADRENALINE SHIELD";
  m.bannerMs = 1600;
  playSecondWindSfx();
  const ai = m.fighters.creator;
  ai.stunMs = 3000;
  ai.attack = null;
  ai.blockHeld = false;
  m.buffs.player *= 1.4;
}

function triggerOverdrive(m: MatchState, ai: FighterRT) {
  m.overdrive = true;
  ai.hp = Math.max(ai.hp, 50);
  ai.shieldMs = 2600;
  ai.pose = "secondWind";
  ai.seq += 1;
  m.shieldFx = { id: ++m.fxId, kind: "overdrive" };
  m.shieldFxMs = 1600;
  m.banner = "AI BOSS OVERDRIVE!";
  m.bannerMs = 1600;
  playSecondWindSfx();
  m.buffs.ai = 2.0;
  m.aiAction = { kind: "telegraph", attack: "critical", dur: 300 };
  m.aiActionMs = 0;
  m.aiNextMs = 400;
}

function tryStartPlayerAttack(m: MatchState, kind: AttackKind, script: MatchScript) {
  const p = m.fighters.challenger;
  if (m.stage !== "fight" || p.down || p.stunMs > 0 || p.attack) return;
  const cost = kind === "special" ? 40 : kind === "critical" ? 100 : 0;
  if (p.meter < cost) return;
  p.meter = Math.max(0, p.meter - cost);
  const moves = m.moves.challenger;
  const move =
    kind === "special"
      ? moves.signatureMove
      : kind === "critical"
        ? moves.criticalArt
        : null;
  const cls = script.challengerClass;
  p.attack = {
    kind,
    windup: WINDUP_FOR[cls][kind],
    recover: RECOVER_FOR[cls][kind],
    move,
  };
  p.activeMoveName = move ? move.name : null;
  p.pose = "attack";
  p.seq += 1;
}

function applyHit(
  m: MatchState,
  attacker: FighterRT,
  defender: FighterRT,
  a: ActiveAttack,
  isPlayer: boolean,
  script: MatchScript,
  playerSide: PlayerSide,
) {
  const dist = Math.abs(attacker.x - defender.x);
  if (dist > REACH[a.kind]) return; // whiff — out of range! No sound, no damage.
  if (defender.shieldMs > 0) return; // invulnerable

  const crit = a.kind === "critical" || a.kind === "special";
  let dmg: number;
  if (isPlayer) {
    if (a.kind === "light") dmg = randInt(8, 12);
    else if (a.kind === "heavy") dmg = randInt(14, 19);
    else dmg = randInt(a.move!.damage[0], a.move!.damage[1]);
    dmg *= m.buffs.player;
  } else {
    if (a.kind === "light") dmg = randInt(7, 11);
    else if (a.kind === "heavy") dmg = randInt(12, 17);
    else dmg = randInt(a.move!.damage[0], a.move!.damage[1]) * 0.9;
    dmg *= m.buffs.ai;
  }
  const blocked = defender.blockHeld;
  if (blocked) dmg *= 0.2; // 80% damage reduction while blocking
  dmg = Math.max(1, Math.round(dmg));
  defender.hp = Math.max(0, defender.hp - dmg);

  // Super meter: attacker builds on clean hits, defender builds on taking a hit
  if (a.kind === "light") attacker.meter = Math.min(100, attacker.meter + 10);
  else if (a.kind === "heavy") attacker.meter = Math.min(100, attacker.meter + 14);
  defender.meter = Math.min(100, defender.meter + 6);
  if (blocked) defender.meter = Math.min(100, defender.meter + 10);

  // FX + AUDIO: ONLY play strike/impact SFX when attack actually connects
  m.impact = { id: ++m.fxId, x: defender.x };
  m.impactMs = 380;
  m.hurtFx = { id: ++m.fxId, x: defender.x, bright: true };
  m.hurtFxMs = 430;
  m.dust = { id: ++m.fxId, x: attacker.x };
  m.dustMs = 500;
  if (blocked) {
    m.guard = { id: ++m.fxId, x: defender.x };
    m.guardMs = 300;
  }
  const multi = a.move && a.move.hitCount > 1 ? a.move.hitCount : undefined;
  m.hits.push({
    id: ++m.fxId,
    side: defender.side,
    dmg,
    crit: crit && !blocked,
    multi,
    name: (a.kind === "special" || a.kind === "critical") ? a.move?.name : undefined,
    ms: 950,
  });
  if (m.hits.length > 6) m.hits.shift();

  // 90ms arcade hit-stop freeze on heavy hits
  m.hitStopMs = a.kind === "light" ? 60 : 90;
  m.camShakeMs = a.kind === "light" ? 280 : 440;
  playHitSfx();
  if (a.move) playImpactSfx(impactCueFor(a.move.soundCue));
  else playImpactSfx(crit ? "crit" : a.kind === "heavy" ? "slam" : "slash");

  defender.hurtMs = a.kind === "light" ? 220 : 340;
  defender.hurtHeavy = a.kind !== "light";
  defender.hurtBright = true;
  defender.pose = "hit";
  defender.seq += 1;
  if (defender.attack) {
    defender.attack = null;
    defender.activeMoveName = null;
  }

  if (isPlayer) {
    m.combo = {
      id: ++m.fxId,
      count: (m.combo?.count ?? 0) + (a.move?.hitCount ?? 1),
    };
    m.comboMs = 1500;
  }
  if (a.kind === "special" || a.kind === "critical") {
    m.cinematic = { id: ++m.fxId, kind: "critical", moveName: a.move?.name };
    m.cinematicMs = a.kind === "critical" ? 1100 : 750;
    m.moveFx = {
      id: ++m.fxId,
      x: defender.x,
      vfx: a.move!.vfxType,
      kind: a.kind === "critical" ? "critical" : "special",
    };
    m.moveFxMs = MOVE_FX_MS[a.move!.vfxType];
  }

  if (defender.hp <= 0) {
    if (
      defender.side === "challenger" &&
      script.playerWon &&
      !m.shieldUsed &&
      m.orbs.challenger >= 1
    ) {
      triggerSecondWind(m, defender);
    } else if (
      defender.side === "creator" &&
      !script.playerWon &&
      !m.overdrive &&
      m.orbs.creator >= 1
    ) {
      triggerOverdrive(m, defender);
    } else {
      startKO(m, attacker.side, script, playerSide);
    }
  }
}

function updateAttack(
  m: MatchState,
  f: FighterRT,
  dt: number,
  isPlayer: boolean,
  script: MatchScript,
  playerSide: PlayerSide,
) {
  const a = f.attack;
  if (!a) return;
  const foe = isPlayer ? m.fighters.creator : m.fighters.challenger;
  if (a.windup > 0) {
    a.windup -= dt;
    const dir = Math.sign(foe.x - f.x) || (isPlayer ? 1 : -1);
    f.x += dir * LUNGE_SPEED * (dt / 1000);
    f.x = clamp(f.x, trackFor(f.side, playerSide));
    if (a.windup <= 0) applyHit(m, f, foe, a, isPlayer, script, playerSide);
  } else {
    a.recover -= dt;
    if (a.recover <= 0) {
      f.attack = null;
      f.activeMoveName = null;
      f.pose = "idle";
      f.seq += 1;
    }
  }
}

function updateAI(
  m: MatchState,
  dt: number,
  script: MatchScript,
  playerSide: PlayerSide,
) {
  const ai = m.fighters.creator;
  const p = m.fighters.challenger;
  if (ai.down || ai.stunMs > 0) {
    ai.moveDir = 0;
    ai.leanDir = null;
    return;
  }

  // If AI is executing an attack, let the attack cycle complete
  if (ai.attack) {
    ai.moveDir = 0;
    ai.leanDir = null;
    return;
  }

  const dist = Math.abs(ai.x - p.x);
  const reach = REACH.light;

  // OUT OF RANGE: Aggressively walk/dash across the stage towards the player
  if (dist > reach - 2) {
    const dir = Math.sign(p.x - ai.x) || (playerSide === "left" ? -1 : 1);
    ai.moveDir = dir;
    ai.toward = true;
    ai.leanDir = "forward";
    ai.x += dir * (FIGHTER_SPEED[script.creatorClass] ?? AI_APPROACH_SPEED) * (dt / 1000);
    ai.x = clamp(ai.x, oppTrack(playerSide));
    ai.blockHeld = false;

    // Ground dust puffs while closing distance
    if (Math.random() < 0.16) {
      m.dust = { id: ++m.fxId, x: ai.x };
      m.dustMs = 350;
    }
    return;
  }

  // IN RANGE: Active mix-ups and attacks (cadence: 160-280ms)
  m.aiNextMs -= dt;
  if (m.aiNextMs <= 0) {
    m.aiNextMs = randInt(160, 280);

    // If player is attacking in wind-up, 40% chance AI raises guard
    if (p.attack && p.attack.windup > 0 && Math.random() < 0.42) {
      ai.blockHeld = true;
      ai.moveDir = 0;
      ai.leanDir = null;
      return;
    }

    ai.blockHeld = false;

    // Super Meter attacks
    const roll = Math.random();
    if (ai.meter >= 100 && roll < 0.45) {
      // Critical Art
      ai.meter = 0;
      const move = m.moves.creator.criticalArt;
      ai.attack = {
        kind: "critical",
        windup: WINDUP_FOR[script.creatorClass].critical,
        recover: RECOVER_FOR[script.creatorClass].critical,
        move,
      };
      ai.activeMoveName = move.name;
      ai.pose = "attack";
      ai.seq += 1;
      ai.moveDir = 0;
      ai.leanDir = null;
    } else if (ai.meter >= 40 && roll < 0.40) {
      // Signature Special
      ai.meter -= 40;
      const move = m.moves.creator.signatureMove;
      ai.attack = {
        kind: "special",
        windup: WINDUP_FOR[script.creatorClass].special,
        recover: RECOVER_FOR[script.creatorClass].special,
        move,
      };
      ai.activeMoveName = move.name;
      ai.pose = "attack";
      ai.seq += 1;
      ai.moveDir = 0;
      ai.leanDir = null;
    } else {
      // Light / Heavy strikes or quick guard / micro-step
      const actRoll = Math.random();
      if (actRoll < 0.45) {
        ai.attack = {
          kind: "light",
          windup: WINDUP_FOR[script.creatorClass].light,
          recover: RECOVER_FOR[script.creatorClass].light,
          move: null,
        };
        ai.activeMoveName = null;
        ai.pose = "attack";
        ai.seq += 1;
        ai.moveDir = 0;
        ai.leanDir = null;
      } else if (actRoll < 0.75) {
        ai.attack = {
          kind: "heavy",
          windup: WINDUP_FOR[script.creatorClass].heavy,
          recover: RECOVER_FOR[script.creatorClass].heavy,
          move: null,
        };
        ai.activeMoveName = null;
        ai.pose = "attack";
        ai.seq += 1;
        ai.moveDir = 0;
        ai.leanDir = null;
      } else if (actRoll < 0.88) {
        // Short tactical guard
        ai.blockHeld = true;
        m.aiNextMs = randInt(160, 240);
        ai.moveDir = 0;
        ai.leanDir = null;
      } else {
        // Micro backstep to bait whiff
        const retreatDir = Math.sign(ai.x - p.x) || (playerSide === "left" ? 1 : -1);
        ai.x += retreatDir * ((FIGHTER_SPEED[script.creatorClass] ?? AI_APPROACH_SPEED) * 0.75) * (dt / 1000);
        ai.x = clamp(ai.x, oppTrack(playerSide));
        ai.moveDir = retreatDir;
        ai.leanDir = "retreat";
      }
    }
  }
}

function syncMechanics(m: MatchState, script: MatchScript) {
  const p = m.fighters.challenger;
  const ai = m.fighters.creator;
  if (
    script.playerWon &&
    !m.shieldUsed &&
    m.orbs.challenger >= 1 &&
    p.hp <= 30
  ) {
    triggerSecondWind(m, p);
  }
  if (
    !script.playerWon &&
    !m.overdrive &&
    m.orbs.creator >= 1 &&
    ai.hp <= 45
  ) {
    triggerOverdrive(m, ai);
  }
}

function resolveTimer(m: MatchState, script: MatchScript, playerSide: PlayerSide) {
  const p = m.fighters.challenger;
  const ai = m.fighters.creator;
  let winner: FighterSide;
  if (p.hp === ai.hp) winner = script.chainWinner;
  else if (m.orbs.challenger >= 1 && script.chainWinner === "challenger")
    winner = "challenger";
  else if (m.orbs.creator >= 1 && script.chainWinner === "creator")
    winner = "creator";
  else winner = p.hp > ai.hp ? "challenger" : "creator";
  startKO(m, winner, script, playerSide);
}

function updateFight(
  m: MatchState,
  dt: number,
  script: MatchScript,
  playerSide: PlayerSide,
) {
  m.timer -= dt / 1000;
  if (m.timer <= 0) {
    resolveTimer(m, script, playerSide);
    return;
  }
  const p = m.fighters.challenger;
  const ai = m.fighters.creator;

  // Player manual movement (only while the fight stage is live).
  p.blockHeld = m.heldBlock;
  const speed = (FIGHTER_SPEED[script.challengerClass] ?? MOVE_SPEED) * (p.blockHeld ? 0.4 : 1);
  p.moveDir = (m.heldRight ? 1 : 0) - (m.heldLeft ? 1 : 0);
  if (p.moveDir !== 0) {
    p.x += p.moveDir * speed * (dt / 1000);
    p.x = clamp(p.x, playerTrack(playerSide));
    p.toward = p.moveDir > 0 === p.x < ai.x;
    p.leanDir = p.toward ? "forward" : "retreat";
    if (Math.random() < 0.18) {
      m.dust = { id: ++m.fxId, x: p.x };
      m.dustMs = 350;
    }
  } else {
    p.leanDir = null;
  }

  // Consume a queued player attack.
  if (m.attackQueued) {
    const kind = m.attackQueued;
    m.attackQueued = null;
    tryStartPlayerAttack(m, kind, script);
  }

  updateAI(m, dt, script, playerSide);
  updateAttack(m, p, dt, true, script, playerSide);
  updateAttack(m, ai, dt, false, script, playerSide);
  tickFighter(p, dt);
  tickFighter(ai, dt);
  syncMechanics(m, script);
}

function step(
  m: MatchState,
  dt: number,
  script: MatchScript,
  playerSide: PlayerSide,
  onRoundWin?: (winner: FighterSide) => void,
) {
  m.stageMs += dt;
  if (m.hitStopMs > 0) {
    m.hitStopMs -= dt;
    decayFx(m, dt);
    return;
  }
  switch (m.stage) {
    case "faceoff":
      if (m.stageMs >= m.stageDur) startRound(m, 1, script, playerSide);
      break;
    case "roundintro":
      if (m.stageMs >= m.stageDur) {
        m.stage = "fight";
        m.stageMs = 0;
        m.timer = 99;
      }
      break;
    case "fight":
      updateFight(m, dt, script, playerSide);
      break;
    case "ko":
      if (m.stageMs >= m.stageDur) {
        const winner = m.roundWinner ?? script.chainWinner;
        m.orbs[winner] += 1;
        onRoundWin?.(winner);
        // Best-of-3: first fighter to 2 round wins ends the match immediately!
        if (m.orbs[winner] >= 2 || m.orbs.challenger >= 2 || m.orbs.creator >= 2) {
          m.stage = "verdict";
          m.stageMs = 0;
          m.matchWinner = m.orbs.challenger >= 2 ? "challenger" : "creator";
        } else {
          startRound(m, (m.round + 1) as 1 | 2 | 3, script, playerSide);
        }
      }
      break;
    case "verdict":
      break;
  }
  decayFx(m, dt);
}

/* ------------------------------------------------------------------- props */

type BattleArenaModalProps = {
  outcome: DuelOutcome | null;
  creatorFighter: FighterDescriptor;
  challengerFighter: FighterDescriptor;
  explorerTxUrl?: string;
  /** Timeline only starts when this is true AND outcome is confirmed. */
  isOpen?: boolean;
  /** Which side of the stage the local player occupies. */
  playerSide?: PlayerSide;
  /** Verdict "Play Again" — re-runs the on-chain stake flow for a rematch. */
  onPlayAgain?: () => void;
  /** While the rematch stake is awaiting wallet/chain confirmation. */
  onPlayAgainBusy?: boolean;
  onClose: () => void;
};

const emptyFighterView: FighterView = {
  x: 32,
  hp: 100,
  meter: 0,
  pose: "idle",
  seq: 0,
  facing: "right",
  blockHeld: false,
  hurtBright: false,
  down: false,
  shield: false,
  moveDir: 0,
  toward: false,
  leanDir: null,
  activeMoveName: null,
};

const initialView: View = {
  stage: "faceoff",
  round: 1,
  timer: 99,
  banner: null,
  orbs: { creator: 0, challenger: 0 },
  fighters: { creator: emptyFighterView, challenger: emptyFighterView },
  impact: null,
  dust: null,
  hurtFx: null,
  moveFx: null,
  cinematic: null,
  combo: null,
  camShake: false,
  hitStop: false,
  guard: null,
  shieldFx: null,
  hits: [],
  heldLeft: false,
  heldRight: false,
  heldBlock: false,
};

/**
 * Street-Fighter-style 3-round battle stage driven by a REAL-TIME manual
 * game loop. The player's fighter only moves / blocks / attacks when the
 * user presses keys or the arcade buttons; the opponent runs an independent
 * AI behaviour loop. Combat physics live in a ref (never in React state),
 * stepped by a single requestAnimationFrame loop and mirrored into a view
 * object for rendering.
 */
export function BattleArenaModal({
  outcome,
  creatorFighter,
  challengerFighter,
  explorerTxUrl,
  isOpen = true,
  playerSide = "left",
  onPlayAgain,
  onPlayAgainBusy = false,
  onClose,
}: BattleArenaModalProps) {
  const [view, setView] = useState<View>(initialView);
  const [narrow, setNarrow] = useState(false);

  /* Manual best-of-3 round scoreboard. Refs are the authoritative counters
   * (updated synchronously inside the rAF loop); state mirrors them for
   * rendering. The final verdict is decided ONLY from these counts. */
  const playerWinsRef = useRef(0);
  const opponentWinsRef = useRef(0);
  const [playerWins, setPlayerWins] = useState(0);
  const [opponentWins, setOpponentWins] = useState(0);

  const matchRef = useRef<MatchState | null>(null);
  const viewRef = useRef<View>(initialView);

  const nameOf = (side: FighterSide): string =>
    side === "creator" ? creatorFighter.name : challengerFighter.name;

  /* Winner/loser sides + Second Wind resolution — computed once. */
  const script = useMemo<MatchScript | null>(() => {
    if (!outcome) return null;
    const creatorWon =
      outcome.winnerAddress.toLowerCase() ===
      creatorFighter.address.toLowerCase();
    const finalWinnerSide: FighterSide = creatorWon ? "creator" : "challenger";
    const loserSide: FighterSide = creatorWon ? "challenger" : "creator";
    const revivedSide: FighterSide | null = outcome.secondWind ? loserSide : null;
    const revivedWins =
      revivedSide != null &&
      outcome.resurrectedAddress != null &&
      outcome.winnerAddress.toLowerCase() ===
        outcome.resurrectedAddress.toLowerCase();
    return {
      playerWon: outcome.userWon,
      chainWinner: outcome.userWon ? "challenger" : "creator",
      finalWinnerSide,
      loserSide,
      revivedSide,
      revivedWins,
      creatorClass: creatorFighter.fighterClass,
      challengerClass: challengerFighter.fighterClass,
    };
  }, [
    outcome,
    creatorFighter.address,
    creatorFighter.fighterClass,
    challengerFighter.fighterClass,
  ]);

  /* ================= REAL-TIME GAME LOOP =================
   * Single rAF loop: step the ref-based match state, then mirror a plain
   * view object into React state for rendering. Never re-triggered by view
   * updates — only by isOpen + a fresh confirmed outcome. */
  useEffect(() => {
    if (!isOpen || !outcome || !script) return;
    resetArenaAudio();
    const m = createMatch(script, playerSide);
    matchRef.current = m;
    const snap = snapshot(m);
    viewRef.current = snap;
    setView(snap);

    let raf = 0;
    let last = performance.now();
    /* Award a round win the moment a K.O. resolves. Refs are bumped first
     * (no stale-closure risk), then mirrored into state for the HUD. */
    const onRoundWin = (winner: FighterSide) => {
      if (winner === "challenger") {
        playerWinsRef.current += 1;
        setPlayerWins(playerWinsRef.current);
      } else {
        opponentWinsRef.current += 1;
        setOpponentWins(opponentWinsRef.current);
      }
    };
    const loop = (now: number) => {
      const dt = Math.min(now - last, 50);
      last = now;
      step(m, dt, script, playerSide, onRoundWin);
      const next = snapshot(m);
      viewRef.current = next;
      setView(next);
      if (m.stage !== "verdict") raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      matchRef.current = null;
      stopArenaAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, outcome, script, playerSide]);

  /* ================= MANUAL CONTROL TRIGGERS =================
   * Shared by the keyboard handlers and the on-screen arcade buttons.
   * These mutate the ref-based match state directly (no stale closures). */
  const triggerPlayerMove = (dir: "left" | "right", pressed: boolean) => {
    const m = matchRef.current;
    if (!m) return;
    if (dir === "left") m.heldLeft = pressed;
    else m.heldRight = pressed;
  };
  const triggerPlayerBlock = (pressed: boolean) => {
    const m = matchRef.current;
    if (!m) return;
    m.heldBlock = pressed;
  };
  const triggerPlayerAttack = (kind: AttackKind) => {
    const m = matchRef.current;
    if (!m || m.stage !== "fight") return;
    m.attackQueued = kind;
  };

  const moveRef = useRef(triggerPlayerMove);
  moveRef.current = triggerPlayerMove;
  const blockRef = useRef(triggerPlayerBlock);
  blockRef.current = triggerPlayerBlock;
  const attackRef = useRef(triggerPlayerAttack);
  attackRef.current = triggerPlayerAttack;

  /* PC keyboard: hold-to-move/block on keydown/keyup, strikes on keydown. */
  useEffect(() => {
    if (!isOpen) return;
    const GAME_KEYS = new Set([
      "KeyA",
      "KeyD",
      "KeyS",
      "KeyJ",
      "KeyK",
      "KeyL",
      "KeyU",
      "ArrowLeft",
      "ArrowRight",
      "ArrowDown",
      "Space",
      "Enter",
    ]);
    const onDown = (e: KeyboardEvent) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      switch (e.code) {
        case "KeyA":
        case "ArrowLeft":
          moveRef.current("left", true);
          break;
        case "KeyD":
        case "ArrowRight":
          moveRef.current("right", true);
          break;
        case "KeyS":
        case "ArrowDown":
          blockRef.current(true);
          break;
        case "KeyJ":
        case "Space":
        case "Enter":
          if (!e.repeat) attackRef.current("light");
          break;
        case "KeyK":
          if (!e.repeat) attackRef.current("heavy");
          break;
        case "KeyL":
          if (!e.repeat) attackRef.current("special");
          break;
        case "KeyU":
          if (!e.repeat) attackRef.current("critical");
          break;
      }
    };
    const onUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case "KeyA":
        case "ArrowLeft":
          moveRef.current("left", false);
          break;
        case "KeyD":
        case "ArrowRight":
          moveRef.current("right", false);
          break;
        case "KeyS":
        case "ArrowDown":
          blockRef.current(false);
          break;
      }
    };
    const onBlur = () => {
      moveRef.current("left", false);
      moveRef.current("right", false);
      blockRef.current(false);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [isOpen]);

  /* Narrow-viewport tracking for proportional sprite scaling. */
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  if (!outcome || !script) return null;

  const revivedName = script.revivedSide ? nameOf(script.revivedSide) : null;
  const leftSide: FighterSide = playerSide === "left" ? "challenger" : "creator";
  const rightSide: FighterSide = leftSide === "challenger" ? "creator" : "challenger";
  const leftDesc = leftSide === "challenger" ? challengerFighter : creatorFighter;
  const rightDesc = rightSide === "challenger" ? challengerFighter : creatorFighter;

  /* Dynamic Stage Camera & Zoom */
  const dist = Math.abs(view.fighters.creator.x - view.fighters.challenger.x);
  const closeRatio = Math.max(0, Math.min(1, (65 - dist) / 45));
  const isCriticalArt = view.cinematic?.kind === "critical";
  const cameraScale = isCriticalArt ? 1.22 : 1.0 + closeRatio * 0.12;
  const midX = (view.fighters.creator.x + view.fighters.challenger.x) / 2;
  const cameraPanX = (50 - midX) * 0.22;

  /* The match winner is decided STRICTLY from the manual round scoreboard —
   * never from the pre-rolled on-chain outcome. First to 2 round wins. */
  const manualPlayerWon = playerWins >= 2;
  const leftWins = leftSide === "challenger" ? playerWins : opponentWins;
  const rightWins = rightSide === "challenger" ? playerWins : opponentWins;

  return (
    <div className="fixed inset-0 z-[95] flex h-[100dvh] items-center justify-center bg-black/90 p-2 backdrop-blur-sm sm:h-[90vh] sm:p-4">
      <div
        className="relative flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-red-500/30 bg-zinc-950 shadow-[0_0_70px_-10px_rgba(239,68,68,0.3)]"
        role="dialog"
        aria-modal="true"
      >
        {/* ================= FINAL VERDICT ================= */}
        {view.stage === "verdict" ? (
          <VerdictScreen
            outcome={outcome}
            manualWon={manualPlayerWon}
            creatorName={creatorFighter.name}
            challengerName={challengerFighter.name}
            creatorFighter={creatorFighter}
            challengerFighter={challengerFighter}
            revivedName={revivedName}
            explorerTxUrl={explorerTxUrl}
            onPlayAgain={onPlayAgain}
            onPlayAgainBusy={onPlayAgainBusy}
            onClose={onClose}
          />
        ) : (
          <>
            {/* ============ ARCADE HUD ============ */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-white/10 bg-black/70 px-3 pb-3 pt-4 sm:gap-4 sm:px-6">
              <HudSide
                fighter={leftDesc}
                hp={view.fighters[leftSide].hp}
                align="left"
              />
              <div className="flex flex-col items-center gap-0.5 px-1">
                <p className="font-mono text-2xl font-black tabular-nums text-amber-300 drop-shadow-[0_0_10px_rgba(251,191,36,0.6)]">
                  {String(view.timer).padStart(2, "0")}
                </p>
                <p className="whitespace-nowrap bg-gradient-to-r from-amber-300 to-orange-300 bg-clip-text text-xs font-extrabold text-transparent">
                  {formatMon(outcome.pot)} MON
                </p>
                <p className="whitespace-nowrap text-[9px] font-bold uppercase tracking-widest text-red-300/90">
                  {view.round === 3 ? "FINAL ROUND" : `ROUND ${view.round}`} · Orbs{" "}
                  <span className="text-amber-300">
                    {leftWins}–{rightWins}
                  </span>
                </p>
              </div>
              <HudSide
                fighter={rightDesc}
                hp={view.fighters[rightSide].hp}
                align="right"
              />
            </div>

            {/* ============ 2D BATTLE STAGE ============ */}
            <div
              className={cn(
                "relative h-[38dvh] min-h-[260px] overflow-hidden sm:h-[470px]",
                view.camShake && "arena-cam-shake",
                view.hitStop && "arena-hit-stop",
                view.cinematic && "arena-cinematic-zoom",
              )}
            >
              {/* Camera transform wrapper with dynamic zoom and pan */}
              <div
                className="relative h-full w-full will-change-transform transition-transform duration-150 ease-out"
                style={{
                  transform: `scale(${cameraScale}) translateX(${cameraPanX}%)`,
                  transformOrigin: "50% 75%",
                }}
              >
                {/* Arena background art — heavily dimmed + softened */}
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{
                    backgroundImage: "url(/assets/arena-background.jpg)",
                    filter: "brightness(0.5) contrast(0.9) blur(2px)",
                  }}
                  aria-hidden
                />
                {/* Heavy dark gradient overlay — keeps HUD, fighters, and
                    floating text crisp against a quiet backdrop */}
                <div
                  className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-zinc-950/60"
                  aria-hidden
                />

                {/* Critical Art Cut-In Dark Vignette */}
                {isCriticalArt && (
                  <div
                    className="pointer-events-none absolute inset-0 z-[22] bg-black/85 backdrop-blur-[1px] transition-opacity duration-200"
                    aria-hidden
                  />
                )}

                {/* Dramatic Street-Style Streak Across Screen */}
                {isCriticalArt && (
                  <div
                    className="critical-streak-slash pointer-events-none absolute inset-x-[-15%] top-1/2 z-[24] h-2.5 bg-gradient-to-r from-transparent via-amber-300 via-rose-500 to-transparent shadow-[0_0_26px_rgba(239,68,68,1)]"
                    aria-hidden
                  />
                )}

                {/* Arena floor — subtle gradient, no harsh graphics */}
                <div className="absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-b from-transparent via-[#241a3d]/40 to-[#120d22]/70">
                  <svg
                    className="absolute inset-0 h-full w-full"
                    viewBox="0 0 800 160"
                    preserveAspectRatio="none"
                    aria-hidden
                  >
                    {Array.from({ length: 9 }).map((_, i) => (
                      <line
                        key={i}
                        x1={i * 100}
                        y1="0"
                        x2={400 + (i * 100 - 400) * 1.6}
                        y2="160"
                        stroke="#7c3aed"
                        strokeWidth="0.8"
                        opacity="0.12"
                      />
                    ))}
                    <line
                      x1="0"
                      y1="2"
                      x2="800"
                      y2="2"
                      stroke="#a855f7"
                      strokeWidth="2"
                      opacity="0.25"
                    />
                  </svg>
                  {[
                    { left: "18%", top: "30%", glyph: "ᛝ" },
                    { left: "48%", top: "55%", glyph: "ᛟ" },
                    { left: "76%", top: "25%", glyph: "ᛉ" },
                  ].map((rune) => (
                    <span
                      key={rune.glyph}
                      className="animate-pulse absolute select-none text-2xl text-purple-400/30 drop-shadow-[0_0_10px_rgba(168,85,247,0.4)]"
                      style={{ left: rune.left, top: rune.top }}
                      aria-hidden
                    >
                      {rune.glyph}
                    </span>
                  ))}
                </div>

                {/* Ambient fighter lighting — soft backlight spots */}
                {(["creator", "challenger"] as const).map((side) => {
                  const f = view.fighters[side];
                  const anchor = { left: `${f.x}%` };
                  return (
                    <div key={`light-${side}`} aria-hidden>
                      {/* Backlight spot */}
                      <div
                        className="pointer-events-none absolute bottom-8 h-56 w-56 -translate-x-1/2 rounded-full blur-xl"
                        style={{
                          ...anchor,
                          background:
                            "radial-gradient(circle, rgba(255,255,255,0.10), rgba(139,92,246,0.08) 50%, transparent 72%)",
                        }}
                      />
                      {/* Floor light pool */}
                      <div
                        className="pointer-events-none absolute bottom-3 h-7 w-48 -translate-x-1/2 rounded-[50%] blur-md"
                        style={{
                          ...anchor,
                          background:
                            "radial-gradient(ellipse, rgba(196,181,253,0.22), rgba(168,85,247,0.10) 55%, transparent 75%)",
                        }}
                      />
                    </div>
                  );
                })}

                {/* Fighters + Motion Afterimages (Shadow Clones) */}
                {(["creator", "challenger"] as const).map((side) => {
                  const f = view.fighters[side];
                  const desc = side === "creator" ? creatorFighter : challengerFighter;
                  const classCfg = CLASS_AFTERIMAGE_CONFIG[desc.fighterClass];

                  const isDashing = f.moveDir !== 0;
                  const isSpecialOrCrit = f.pose === "attack" && Boolean(f.activeMoveName);
                  const showAfterimages = isDashing || isSpecialOrCrit;

                  const dirSign = f.moveDir !== 0 ? f.moveDir : (f.facing === "right" ? 1 : -1);
                  const offsets = [-dirSign * 3.5, -dirSign * 7.5, -dirSign * 11.5];
                  const opacities = [0.5, 0.25, 0.1];

                  return (
                    <div key={side}>
                      {/* 3 fading neon silhouette afterimages */}
                      {showAfterimages &&
                        [0, 1, 2].map((idx) => (
                          <div
                            key={`afterimage-${side}-${idx}`}
                            className="sprite-pixelated afterimage-ghost absolute bottom-5"
                            style={{
                              left: `${f.x + offsets[idx]}%`,
                              transform: "translateX(-50%)",
                              opacity: opacities[idx],
                              ["--afterimage-glow" as string]: classCfg.color,
                              zIndex: 10 + idx,
                            }}
                            aria-hidden
                          >
                             <ChromaFighter
                               fighterClass={desc.fighterClass}
                               state={f.pose}
                               facing={f.facing}
                               size={stageSize(desc, narrow)}
                               animKey={`after-${side}-${idx}-${f.pose}`}
                               leanDir={f.leanDir}
                             />
                          </div>
                        ))}

                       {/* Main Fighter Body */}
                       <div
                         className="sprite-pixelated absolute bottom-5 z-30"
                         style={{ left: `${f.x}%`, transform: "translateX(-50%)", opacity: 1, visibility: "visible" }}
                       >
                        <div className="assist-stance">
                          <ChromaFighter
                            fighterClass={desc.fighterClass}
                            state={f.pose}
                            facing={f.facing}
                            size={stageSize(desc, narrow)}
                            animKey={`${f.pose}-${f.seq}`}
                            activeMoveName={f.activeMoveName}
                            leanDir={f.leanDir}
                            isBlocking={f.blockHeld}
                            moveDir={f.moveDir}
                          />
                        </div>
                        {/* Guard aura — shield shimmer while blocking */}
                        {f.blockHeld && (
                          <div
                            className="pointer-events-none absolute bottom-0 left-1/2 z-[25] h-28 w-28 -translate-x-1/2 rounded-full border-2 border-cyan-300/70 bg-cyan-300/10"
                            style={{ boxShadow: "0 0 20px rgba(34,211,238,0.5)" }}
                            aria-hidden
                          />
                        )}
                        {view.hits
                          .filter((h) => h.side === side)
                          .map((h) => (
                            <DamageNumber key={h.id} hit={h} />
                          ))}
                      </div>
                    </div>
                  );
                })}

                {/* Dash-in dust/smoke behind the attacker */}
                {view.dust && <DustFx key={`dust-${view.dust.id}`} x={view.dust.x} />}

                {/* Defender stagger: red flash frame + damage sparks */}
                {view.hurtFx && (
                  <>
                    <StaggerFlash
                      key={`flash-${view.hurtFx.id}`}
                      x={view.hurtFx.x}
                      bright={view.hurtFx.bright}
                    />
                    <DamageSparks
                      key={`sparks-${view.hurtFx.id}`}
                      x={view.hurtFx.x}
                    />
                  </>
                )}

                {/* Signature / Critical Art move FX */}
                {view.moveFx?.vfx === "void_rift" && (
                  <SlamFx key={`slam-${view.moveFx.id}`} x={view.moveFx.x} />
                )}
                {view.moveFx?.vfx === "laser" && (
                  <KeonePortalFx key={`portal-${view.moveFx.id}`} x={view.moveFx.x} />
                )}
                {view.moveFx?.vfx === "magma" && (
                  <ChogzillaSlamFx key={`chog-${view.moveFx.id}`} x={view.moveFx.x} />
                )}
                 {view.moveFx?.vfx === "slash" && (
                   <SamuraiSlashFx key={`sam-${view.moveFx.id}`} x={view.moveFx.x} />
                 )}
                 {view.moveFx?.vfx === "fist" && (
                   <FistFx key={`fist-${view.moveFx.id}`} x={view.moveFx.x} />
                 )}
                 {view.moveFx?.vfx === "orb" && (
                   <OrbFx key={`orb-${view.moveFx.id}`} x={view.moveFx.x} />
                 )}
                 {view.moveFx?.vfx === "breath" && (
                   <BreathFx key={`breath-${view.moveFx.id}`} x={view.moveFx.x} />
                 )}

                {/* Cyberpunk hit-marker on every clean strike */}
                {view.impact && (
                  <NeonHitMarker key={`burst-${view.impact.id}`} x={view.impact.x} />
                )}

                {/* Guard flash on a blocked hit */}
                {view.guard && (
                  <div
                    key={`guard-${view.guard.id}`}
                    className="pointer-events-none absolute bottom-16 z-[28] h-24 w-24 rounded-full border-4 border-cyan-300/90"
                    style={{
                      left: `${view.guard.x}%`,
                      transform: "translateX(-50%)",
                      boxShadow: "0 0 28px rgba(34,211,238,0.95)",
                    }}
                    aria-hidden
                  />
                )}
              </div>

              {/* Floating combo hit counter */}
              {view.combo && (
                <div
                  key={`combo-${view.combo.id}`}
                  className="combo-pop pointer-events-none absolute left-1/2 top-2 z-[31] -translate-x-1/2 text-center"
                  aria-live="polite"
                >
                  <p
                    className={cn(
                      "combo-count-text whitespace-nowrap font-mono font-black italic tracking-[0.25em]",
                      view.combo.count >= 10
                        ? "text-4xl text-amber-300"
                        : "text-2xl text-orange-300",
                    )}
                  >
                    {view.combo.count >= 10
                      ? `${view.combo.count} HITS!`
                      : `${view.combo.count} Hit${view.combo.count > 1 ? "s" : ""}...`}
                  </p>
                </div>
              )}

              {/* Cinematic camera: vignette + color flash + big arcade text */}
              {view.cinematic && (
                <div
                  key={`cine-${view.cinematic.id}`}
                  className="pointer-events-none absolute inset-0 z-[32]"
                  aria-live="assertive"
                >
                  <div className="cinematic-vignette absolute inset-0" />
                  <div className="cinematic-flash absolute inset-0" />
                  {/* Subtle glitch strips */}
                  <div
                    className="glitch-strip absolute left-[16%] top-[38%] h-2.5 w-36 bg-gradient-to-r from-transparent via-cyan-400/45 to-transparent"
                    style={{ animationDelay: "60ms" }}
                  />
                  <div
                    className="glitch-strip absolute left-[54%] top-[58%] h-2 w-40 bg-gradient-to-r from-transparent via-fuchsia-400/45 to-transparent"
                    style={{ animationDelay: "140ms" }}
                  />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                    <p
                      className={cn(
                        "cinematic-text whitespace-nowrap font-black italic tracking-[0.12em]",
                        view.cinematic.kind === "ko" &&
                          "text-6xl text-amber-300 drop-shadow-[0_0_30px_rgba(251,191,36,0.95)] sm:text-7xl",
                        view.cinematic.kind === "critical" &&
                          "text-5xl bg-gradient-to-r from-red-400 via-amber-300 to-red-500 bg-clip-text text-transparent drop-shadow-[0_0_24px_rgba(239,68,68,0.9)] sm:text-6xl",
                      )}
                    >
                      {view.cinematic.kind === "ko" ? "K.O." : "CRITICAL ART"}
                    </p>
                    {view.cinematic.moveName && (
                      <p className="cinematic-move-name whitespace-nowrap text-xs font-black uppercase tracking-[0.35em] text-white/90 drop-shadow-[0_0_12px_rgba(255,255,255,0.6)] sm:text-sm">
                        {view.cinematic.moveName}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Banner overlays: ROUND N // FIGHT!, K.O., sync events */}
              {view.banner && !view.cinematic && !view.shieldFx && (
                <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
                  <div className="animate-round-banner text-center">
                    <p className="whitespace-nowrap bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-200 bg-clip-text text-4xl font-black tracking-[0.15em] text-transparent drop-shadow-[0_0_26px_rgba(251,191,36,0.85)] sm:text-5xl">
                      {view.banner}
                    </p>
                    {view.stage === "roundintro" && (
                      <p className="mt-1 text-lg font-black uppercase tracking-[0.5em] text-red-400 drop-shadow-[0_0_14px_rgba(239,68,68,0.8)]">
                        FIGHT!
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Face-off intro */}
              {view.stage === "faceoff" && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-1">
                    <p className="animate-pop-in whitespace-nowrap bg-gradient-to-r from-red-300 via-amber-200 to-orange-300 bg-clip-text text-4xl font-black tracking-widest text-transparent drop-shadow-[0_0_22px_rgba(239,68,68,0.9)] sm:text-5xl">
                      ⚔️ READY?
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-zinc-400">
                      {nameOf(leftSide)} vs {nameOf(rightSide)} · Best of 3
                    </p>
                  </div>
                </div>
              )}

              {/* Second Wind / AI Overdrive flash */}
              {view.shieldFx && (
                <>
                  <div
                    className="animate-second-wind-flash pointer-events-none absolute inset-0 z-20 bg-gradient-to-br from-purple-600/70 via-transparent to-amber-400/60"
                    aria-hidden
                  />
                   <div className="pointer-events-none absolute inset-0 z-30 flex items-start justify-center pt-16">
                     <div className="animate-pop-in rounded-2xl border-2 border-purple-400/60 bg-black/85 px-8 py-6 text-center shadow-[0_0_50px_rgba(168,85,247,0.6)]">
                      <p className="text-5xl">
                        {view.shieldFx.kind === "secondwind" ? "🛡️" : "⚡"}
                      </p>
                      <h3 className="mt-3 bg-gradient-to-r from-purple-200 via-amber-200 to-purple-200 bg-clip-text text-xl font-extrabold tracking-wide text-transparent sm:text-2xl">
                        {view.shieldFx.kind === "secondwind"
                          ? "MONAD SECOND WIND"
                          : "AI BOSS OVERDRIVE"}
                      </h3>
                      <p className="mt-1.5 text-xs font-bold uppercase tracking-widest text-purple-300">
                        {view.shieldFx.kind === "secondwind"
                          ? "ADRENALINE SHIELD · 20% CHOG NFT PERK"
                          : "CRITICAL ART ENGAGED"}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* ===== ARCADE CONTROL DECK — split two-thumb layout =====
                PC: A/S/D + J/K/L/U keys (badges shown on sm+).
                Mobile: touch-action:none buttons, zero tap delay via
                pointerdown — holds for movement/guard, instant for strikes. */}
            <div
              className="arcade-ctl border-t border-white/10 bg-zinc-950/95"
              style={{ WebkitUserSelect: "none", userSelect: "none" }}
            >
              {/* Super meter */}
              <div className="flex items-center gap-2 px-3 pt-2 sm:px-6">
                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                  Super
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-purple-500 via-fuchsia-400 to-amber-300 transition-[width] duration-200"
                    style={{ width: `${view.fighters.challenger.meter}%` }}
                  />
                </div>
                <span className="w-10 text-right font-mono text-[10px] text-zinc-400">
                  {view.fighters.challenger.meter}%
                </span>
              </div>

              <div className="flex flex-row items-center justify-between gap-2 px-3 py-2 sm:px-6 sm:py-4">
                {/* LEFT THUMB — movement & guard */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {(
                    [
                      { dir: "left" as const, label: "Left", badge: "A", active: view.heldLeft },
                      { dir: "block" as const, label: "Block", badge: "S", active: view.heldBlock },
                      { dir: "right" as const, label: "Right", badge: "D", active: view.heldRight },
                    ]
                  ).map((b) => (
                    <button
                      key={b.dir}
                      type="button"
                      aria-label={`${b.label} (${b.badge})`}
                      style={{ touchAction: "none" }}
                      className={cn(
                        "arcade-ctl-btn flex min-w-[62px] flex-col items-center justify-center rounded-xl border px-2.5 py-3 text-[11px] font-black uppercase tracking-wider transition-all active:scale-95 sm:min-w-[78px] sm:px-4",
                        b.active
                          ? "border-amber-400/80 bg-amber-500/25 text-amber-100 shadow-[0_0_16px_rgba(251,191,36,0.35)]"
                          : "border-white/15 bg-zinc-900/80 text-zinc-300",
                      )}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        if (b.dir === "block") triggerPlayerBlock(true);
                        else triggerPlayerMove(b.dir, true);
                      }}
                      onPointerUp={() => {
                        if (b.dir === "block") triggerPlayerBlock(false);
                        else triggerPlayerMove(b.dir, false);
                      }}
                      onPointerCancel={() => {
                        if (b.dir === "block") triggerPlayerBlock(false);
                        else triggerPlayerMove(b.dir, false);
                      }}
                      onPointerLeave={() => {
                        if (b.dir === "block") triggerPlayerBlock(false);
                        else triggerPlayerMove(b.dir, false);
                      }}
                      onTouchStart={(e) => {
                        e.preventDefault();
                        if (b.dir === "block") triggerPlayerBlock(true);
                        else triggerPlayerMove(b.dir, true);
                      }}
                      onTouchEnd={(e) => {
                        e.preventDefault();
                        if (b.dir === "block") triggerPlayerBlock(false);
                        else triggerPlayerMove(b.dir, false);
                      }}
                      onTouchCancel={(e) => {
                        e.preventDefault();
                        if (b.dir === "block") triggerPlayerBlock(false);
                        else triggerPlayerMove(b.dir, false);
                      }}
                    >
                      <span>{b.label}</span>
                      <span className="mt-0.5 hidden rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-bold tracking-normal text-zinc-400 sm:inline">
                        {b.badge}
                      </span>
                    </button>
                  ))}
                </div>

                {/* RIGHT THUMB — attacks & specials
                    2×2 grid on mobile, horizontal row on desktop */}
                <div className="grid grid-cols-2 gap-1.5 sm:flex sm:gap-2">
                  {(
                    [
                      { kind: "light" as const, label: "Light", badge: "J" },
                      { kind: "heavy" as const, label: "Heavy", badge: "K" },
                      { kind: "special" as const, label: "Special", badge: "L" },
                      { kind: "critical" as const, label: "Crit Art", badge: "U" },
                    ]
                  ).map((b) => {
                    const meter = view.fighters.challenger.meter;
                    const ready =
                      b.kind === "special"
                        ? meter >= 40
                        : b.kind === "critical"
                          ? meter >= 100
                          : true;
                    return (
                      <button
                        key={b.kind}
                        type="button"
                        aria-label={`${b.label} (${b.badge})`}
                        style={{ touchAction: "none" }}
                        className={cn(
                          "arcade-ctl-btn flex min-w-[62px] flex-col items-center justify-center rounded-xl border px-2.5 py-3 text-[11px] font-black uppercase tracking-wider transition-all active:scale-95 sm:min-w-[78px] sm:px-4",
                          b.kind === "special" &&
                            ready &&
                            "special-ready text-fuchsia-100",
                          b.kind === "critical" &&
                            ready &&
                            "super-ready text-amber-100",
                          b.kind === "light" &&
                            "border-white/15 bg-zinc-900/80 text-zinc-200",
                          b.kind === "heavy" &&
                            "border-white/15 bg-zinc-900/80 text-zinc-200",
                          !ready &&
                            "border-white/10 bg-zinc-900/40 text-zinc-600",
                        )}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          triggerPlayerAttack(b.kind);
                        }}
                        onTouchStart={(e) => {
                          e.preventDefault();
                          triggerPlayerAttack(b.kind);
                        }}
                      >
                        <span>{b.label}</span>
                        <span className="mt-0.5 hidden rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-bold tracking-normal text-zinc-400 sm:inline">
                          {b.badge}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- arcade HUD */

/**
 * Circular HUD portrait: custom profile picture when set, otherwise a
 * clean class-tinted sprite headshot (no initials, no clutter).
 */
function HudPortrait({ fighter }: { fighter: FighterDescriptor }) {
  const { getProfile } = useFighterProfile();
  const profile = getProfile(fighter.address);
  const theme = FIGHTER_CLASS_META[fighter.fighterClass];
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [profile?.avatarUrl]);

  const avatarUrl = profile?.avatarUrl && !imgFailed ? profile.avatarUrl : null;

  return (
    <span
      className="relative flex h-8 w-8 shrink-0 items-start justify-center overflow-hidden rounded-full border"
      style={{
        borderColor: `${theme.secondary}88`,
        background: "#09090b",
        boxShadow: `0 0 10px ${theme.primary}55`,
      }}
      aria-hidden
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        /* Class sprite headshot — top crop of the idle fighter canvas */
         <span className="sprite-pixelated -mt-0.5 flex items-start justify-center">
           <ChromaVideo src={FIGHTER_CLASS_META[fighter.fighterClass].sprite} size={42} />
         </span>
      )}
    </span>
  );
}

function HudSide({
  fighter,
  hp,
  align,
}: {
  fighter: FighterDescriptor;
  hp: number;
  align: "left" | "right";
}) {
  const barColor =
    hp > 50
      ? "from-emerald-500 to-lime-400"
      : hp > 25
        ? "from-amber-500 to-yellow-400"
        : "from-red-600 to-rose-500";

  const identity = (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2",
        align === "right" && "flex-row-reverse",
      )}
    >
      <HudPortrait fighter={fighter} />
      <div className={cn("min-w-0", align === "right" && "text-right")}>
        <p className="truncate text-xs font-extrabold text-zinc-100">
          {fighter.name}
        </p>
      </div>
    </div>
  );

  const bar = (
    <div
      className="mt-1.5 h-4 w-full overflow-hidden border border-white/15 bg-black/70"
      style={{
        clipPath:
          align === "left"
            ? "polygon(0 0, 100% 0, calc(100% - 12px) 100%, 0 100%)"
            : "polygon(12px 0, 100% 0, 100% 100%, 0 100%)",
      }}
    >
      <div
        className={cn(
          "h-full bg-gradient-to-r transition-[width] duration-500 ease-out",
          barColor,
          align === "right" && "ml-auto bg-gradient-to-l",
        )}
        style={{ width: `${hp}%` }}
      />
    </div>
  );

  return (
    <div className={cn("min-w-0", align === "right" && "text-right")}>
      {identity}
      {bar}
      <p
        className={cn(
          "mt-0.5 font-mono text-[10px] font-bold",
          align === "right" && "text-right",
          hp > 50
            ? "text-emerald-300"
            : hp > 25
              ? "text-amber-300"
              : "text-red-300",
        )}
      >
        {hp} / 100 HP
      </p>
    </div>
  );
}

function DamageNumber({ hit }: { hit: HitRT }) {
  return (
    <p
      className={cn(
        "animate-damage-arc pointer-events-none absolute -top-8 left-1/2 z-10 whitespace-nowrap font-mono text-sm font-black italic tracking-wider",
        hit.crit
          ? "text-amber-300 drop-shadow-[0_0_10px_rgba(251,191,36,0.9)]"
          : "text-red-300 drop-shadow-[0_0_8px_rgba(239,68,68,0.9)]",
      )}
    >
      -{hit.dmg} HP
      {hit.multi && hit.multi > 1 ? ` ×${hit.multi}` : ""}
      {hit.crit ? (
        <span className="ml-1 text-[11px] font-bold tracking-[0.2em] text-amber-200">
          //CRIT
        </span>
      ) : (
        ""
      )}
      {hit.name && (
        <span className="mt-0.5 block text-center text-[10px] font-bold uppercase tracking-[0.25em] text-fuchsia-200 drop-shadow-[0_0_8px_rgba(232,121,249,0.85)]">
          {hit.name}
        </span>
      )}
    </p>
  );
}

/**
 * Cyberpunk hit-marker: neon slash cross (cyan/fuchsia), violet/gold
 * spark flyout, and a sleek white core flash — no cartoon explosions.
 * `x` is the stage-% position of the impact.
 */
function NeonHitMarker({ x }: { x: number }) {
  return (
    <div
      className="pointer-events-none absolute top-[52%] z-[27]"
      style={{ left: `${x}%` }}
      aria-hidden
    >
      {/* Sharp neon slash lines */}
      <span className="hit-marker-slash-a absolute left-0 top-0 h-0.5 w-16 bg-gradient-to-r from-transparent via-cyan-300 to-transparent shadow-[0_0_10px_rgba(34,211,238,0.95)]" />
      <span
        className="hit-marker-slash-b absolute left-0 top-0 h-0.5 w-12 bg-gradient-to-r from-transparent via-fuchsia-300 to-transparent shadow-[0_0_10px_rgba(232,121,249,0.95)]"
        style={{ animationDelay: "40ms" }}
      />
      {/* Violet/gold energy sparks */}
      {[
        { dx: -26, dy: -18, c: "#a78bfa" },
        { dx: 22, dy: -22, c: "#fbbf24" },
        { dx: -18, dy: 20, c: "#fbbf24" },
        { dx: 26, dy: 16, c: "#a78bfa" },
        { dx: 0, dy: -28, c: "#22d3ee" },
        { dx: 4, dy: 26, c: "#a78bfa" },
      ].map((s, i) => (
        <span
          key={i}
          className="hit-marker-spark absolute left-0 top-0 h-1.5 w-1.5 rounded-full"
          style={
            {
              background: s.c,
              boxShadow: `0 0 8px ${s.c}`,
              "--dx": `${s.dx}px`,
              "--dy": `${s.dy}px`,
              animationDelay: `${i * 30}ms`,
            } as CSSProperties
          }
        />
      ))}
      {/* Sleek hit-marker core flash */}
      <span className="hit-marker-core absolute left-0 top-0 h-2.5 w-2.5 rounded-full bg-white shadow-[0_0_16px_rgba(255,255,255,0.95)]" />
    </div>
  );
}

/** Dash-in dust/smoke puffs kicked up behind the attacker. */
function DustFx({ x }: { x: number }) {
  return (
    <div
      className="pointer-events-none absolute bottom-4 z-[18]"
      style={{ left: `${x}%` }}
      aria-hidden
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="dust-puff absolute h-3.5 w-3.5 rounded-full bg-zinc-300/55 blur-[2px]"
          style={{
            left: `${(i - 1.5) * 12}px`,
            animationDelay: `${i * 55}ms`,
          }}
        />
      ))}
    </div>
  );
}

/** Soft radial red/white flash over the staggered defender (blurred — no hard box). */
function StaggerFlash({ x, bright }: { x: number; bright: boolean }) {
  return (
    <div
      className="stagger-flash pointer-events-none absolute bottom-12 z-[26] h-40 w-40 rounded-full blur-xl"
      style={{
        left: `${x}%`,
        background: bright
          ? "radial-gradient(circle, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.2) 45%, transparent 70%)"
          : "radial-gradient(circle, rgba(239,68,68,0.55) 0%, rgba(239,68,68,0.22) 45%, transparent 70%)",
      }}
      aria-hidden
    />
  );
}

/** Directional hit-spark slash lines radiating off the staggered defender (no cartoon emojis). */
function DamageSparks({ x }: { x: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[27]" aria-hidden>
      {[
        { dx: "-44px", dy: "-26px", rot: "-28deg" },
        { dx: "40px", dy: "-32px", rot: "32deg" },
        { dx: "-34px", dy: "26px", rot: "-48deg" },
        { dx: "38px", dy: "22px", rot: "18deg" },
        { dx: "0px", dy: "-40px", rot: "90deg" },
        { dx: "-18px", dy: "36px", rot: "-82deg" },
      ].map((s, i) => (
        <span
          key={i}
          className="directional-spark-burst absolute h-0.5 w-7 rounded-full bg-gradient-to-r from-white via-amber-300 to-purple-400"
          style={
            {
              left: `${x}%`,
              top: "52%",
              transform: `rotate(${s.rot})`,
              boxShadow: "0 0 10px rgba(251,191,36,0.95)",
              "--dx": s.dx,
              "--dy": s.dy,
              animationDelay: `${i * 30}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** Warlord Chogzilla — ground-pound shockwave, blade trail, magma particles. */
function ChogzillaSlamFx({ x }: { x: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[25]" aria-hidden>
      {/* Ground-pound shockwave ring */}
      <div
        className="ground-pound-ring absolute h-44 w-44 rounded-full"
        style={{
          left: `${x}%`,
          top: "58%",
          background:
            "radial-gradient(circle, transparent 42%, rgba(251,146,60,0.95) 50%, rgba(239,68,68,0.75) 58%, transparent 70%)",
          boxShadow: "0 0 44px rgba(249,115,22,0.75)",
        }}
      />
      {/* Burning orange blade trail */}
      <div
        className="blade-trail absolute h-14 w-56"
        style={{
          left: `calc(${x}% - 112px)`,
          top: "40%",
          background:
            "linear-gradient(105deg, transparent 18%, rgba(251,146,60,0.9) 45%, rgba(239,68,68,0.95) 55%, transparent 82%)",
          borderRadius: "9999px",
          filter: "blur(2px)",
        }}
      />
      {/* Explosive magma eruption particles */}
      {Array.from({ length: 8 }).map((_, i) => (
        <span
          key={i}
          className="magma-particle absolute h-2 w-2 rounded-full"
          style={{
            left: `calc(${x}% + ${((i % 4) - 1.5) * 26}px)`,
            bottom: "20%",
            background: i % 2 ? "#f97316" : "#ef4444",
            boxShadow: "0 0 8px rgba(249,115,22,0.95)",
            animationDelay: `${i * 60}ms`,
          }}
        />
      ))}
    </div>
  );
}

/** Chog Samurai — multi-slash streaks, crescent plasma beam, sparks. */
function SamuraiSlashFx({ x }: { x: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[25]" aria-hidden>
      {/* High-speed multi-slash afterimage streaks */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="slash-streak absolute h-1.5 w-44"
          style={{
            left: `calc(${x}% - 88px)`,
            top: `calc(46% + ${i * 14}px)`,
            background:
              "linear-gradient(90deg, transparent, #e9d5ff 40%, #a855f7 62%, transparent)",
            transform: `rotate(${-18 + i * 10}deg)`,
            animationDelay: `${i * 90}ms`,
            boxShadow: "0 0 14px rgba(168,85,247,0.95)",
          }}
        />
      ))}
      {/* Crescent purple plasma beam */}
      <svg
        className="crescent-beam absolute h-40 w-64"
        style={{ left: `${x}%`, top: "36%" }}
        viewBox="0 0 200 120"
        aria-hidden
      >
        <defs>
          <linearGradient id="crescentGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="50%" stopColor="#f0abfc" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
        <path
          d="M10 100 Q 100 0 190 100 Q 100 40 10 100 Z"
          fill="url(#crescentGrad)"
          opacity="0.9"
        />
      </svg>
      {/* Spark particles */}
      {Array.from({ length: 6 }).map((_, i) => (
        <span
          key={i}
          className="spark-particle absolute h-1.5 w-1.5 rounded-full bg-yellow-200"
          style={{
            left: `calc(${x}% + ${((i % 3) - 1) * 34}px)`,
            top: `calc(50% + ${(i % 2 ? -1 : 1) * 18}px)`,
            boxShadow: "0 0 8px #fde047",
            animationDelay: `${i * 50}ms`,
          }}
        />
      ))}
    </div>
  );
}

/** Jagged violet + gold lightning bolts cracking across the slam target. */
function VoidLightning({ x }: { x: number }) {
  return (
    <div
      className="void-lightning pointer-events-none absolute bottom-4 z-30 h-48 w-40"
      style={{ left: `calc(${x}% - 80px)` }}
      aria-hidden
    >
      <svg
        className="h-full w-full"
        viewBox="0 0 100 160"
        preserveAspectRatio="none"
      >
        <polyline
          points="52,0 38,38 60,42 40,88 58,92 42,160"
          fill="none"
          stroke="#c084fc"
          strokeWidth="3.5"
          strokeLinejoin="miter"
          style={{ filter: "drop-shadow(0 0 8px rgba(168,85,247,0.95))" }}
        />
        <polyline
          points="72,8 62,52 80,56 60,108 74,112 66,150"
          fill="none"
          stroke="#fbbf24"
          strokeWidth="2.2"
          strokeLinejoin="miter"
          style={{ filter: "drop-shadow(0 0 6px rgba(251,191,36,0.9))" }}
        />
        <polyline
          points="28,14 34,60 20,64 36,120"
          fill="none"
          stroke="#a855f7"
          strokeWidth="1.8"
          strokeLinejoin="miter"
          opacity="0.85"
        />
      </svg>
    </div>
  );
}

/** VOID CLAW SLAM — shockwave ring + jagged lightning + void runes. */
function SlamFx({ x }: { x: number }) {
  return (
    <>
      <div
        className="void-slam-ring pointer-events-none absolute z-20 h-44 w-44"
        style={{ left: `${x}%`, top: "58%" }}
        aria-hidden
      />
      <VoidLightning x={x} />
      {/* Floating void runes */}
      {["ᚠ", "ᚢ", "ᚦ", "ᚨ"].map((glyph, i) => (
        <span
          key={glyph}
          className="rune-float pointer-events-none absolute z-[26] text-xl font-bold text-purple-300"
          style={{
            left: `calc(${x}% + ${(i - 1.5) * 30}px)`,
            top: "62%",
            animationDelay: `${i * 120}ms`,
            textShadow: "0 0 10px rgba(168,85,247,0.9)",
          }}
          aria-hidden
        >
          {glyph}
        </span>
      ))}
    </>
  );
}

/** Keone Mage signature — holographic purple/magenta portal + lightning burst. */
function KeonePortalFx({ x }: { x: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[25]" aria-hidden>
      {/* Holographic portal ring */}
      <div
        className="keone-portal-bloom absolute h-40 w-40 rounded-full"
        style={{
          left: `${x}%`,
          top: "56%",
          background:
            "radial-gradient(circle, rgba(232,121,249,0.95) 0%, rgba(168,85,247,0.6) 42%, rgba(34,211,238,0.35) 62%, transparent 78%)",
          border: "2px solid rgba(232,121,249,0.85)",
          boxShadow:
            "0 0 44px rgba(217,70,239,0.85), inset 0 0 32px rgba(168,85,247,0.65)",
        }}
      />
      {/* Magenta energy burst flash */}
      <div
        className="keone-burst absolute h-56 w-56 rounded-full"
        style={{
          left: `${x}%`,
          top: "56%",
          background:
            "radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(232,121,249,0.55) 40%, transparent 72%)",
        }}
      />
      {/* Magenta/cyan lightning bolts across the target */}
      <svg
        className="void-lightning absolute bottom-4 h-48 w-40"
        style={{ left: `calc(${x}% - 80px)` }}
        viewBox="0 0 100 160"
        preserveAspectRatio="none"
      >
        <polyline
          points="50,0 40,40 62,44 42,92 58,96 44,160"
          fill="none"
          stroke="#f0abfc"
          strokeWidth="3.5"
          strokeLinejoin="miter"
          style={{ filter: "drop-shadow(0 0 9px rgba(232,121,249,0.95))" }}
        />
        <polyline
          points="74,10 64,54 82,58 62,112 76,116"
          fill="none"
          stroke="#22d3ee"
          strokeWidth="2.2"
          strokeLinejoin="miter"
          style={{ filter: "drop-shadow(0 0 7px rgba(34,211,238,0.9))" }}
        />
        <polyline
          points="26,16 34,62 18,66 34,124"
          fill="none"
          stroke="#d946ef"
          strokeWidth="1.8"
          strokeLinejoin="miter"
          opacity="0.85"
        />
      </svg>
      {/* Holographic data-pane barrage */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="data-pane absolute h-8 w-11 rounded border border-cyan-400/60 bg-cyan-400/10"
          style={{
            left: `calc(${x}% + ${(i - 1) * 48}px)`,
            top: `${26 + i * 11}%`,
            animationDelay: `${i * 80}ms`,
          }}
        />
      ))}
      {/* Purple laser beam */}
      <div
        className="laser-beam absolute h-2.5 w-72"
        style={{
          left: `${x}%`,
          top: "52%",
          background:
            "linear-gradient(90deg, transparent, #d946ef 28%, #f0abfc 50%, #a855f7 72%, transparent)",
          boxShadow: "0 0 20px rgba(217,70,239,0.95)",
        }}
      />
      {/* Digital glitch distortion strips */}
      {[0, 1].map((i) => (
        <div
          key={`glitch-${i}`}
          className="glitch-strip absolute h-3 w-40 bg-gradient-to-r from-transparent via-fuchsia-400/55 to-transparent"
          style={{
            left: `${x}%`,
            top: `${42 + i * 13}%`,
            animationDelay: `${i * 70}ms`,
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- verdict screen */

function VerdictScreen({
  outcome,
  manualWon,
  creatorName,
  challengerName,
  creatorFighter,
  challengerFighter,
  revivedName,
  explorerTxUrl,
  onPlayAgain,
  onPlayAgainBusy = false,
  onClose,
}: {
  outcome: DuelOutcome;
  /** Winner resolved from the manual round scoreboard (first to 2). */
  manualWon: boolean;
  creatorName: string;
  challengerName: string;
  creatorFighter: FighterDescriptor;
  challengerFighter: FighterDescriptor;
  revivedName: string | null;
  explorerTxUrl?: string;
  onPlayAgain?: () => void;
  onPlayAgainBusy?: boolean;
  onClose: () => void;
}) {
  const won = manualWon;
  const clutch = won && outcome.userResurrected;
  const winnerDescriptor = won ? challengerFighter : creatorFighter;
  const loserDescriptor = won ? creatorFighter : challengerFighter;

  return (
    <div
      className={cn(
        "relative overflow-hidden px-6 py-10 text-center sm:px-10 sm:py-12",
        won ? "bg-emerald-950" : "bg-zinc-950",
      )}
    >
      {/* Arena backdrop art */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-40"
        style={{ backgroundImage: "url(/assets/arena-background.jpg)" }}
        aria-hidden
      />
      {/* Tinted dark overlay — verdict text stays crisp */}
      <div
        className={cn(
          "absolute inset-0",
          won
            ? "bg-gradient-to-b from-emerald-950/85 via-zinc-950/80 to-zinc-950/95"
            : "bg-gradient-to-b from-rose-950/80 via-zinc-950/80 to-zinc-950/95",
        )}
        aria-hidden
      />

      <div className="relative z-10">
        {/* Winner / loser sprites flanking the verdict */}
        <div className="mb-2 flex items-end justify-center gap-8">
          <ChromaFighter
            fighterClass={loserDescriptor.fighterClass}
            state="dead"
            facing="right"
            size={140}
          />
          <ChromaFighter
            fighterClass={winnerDescriptor.fighterClass}
            state="victory"
            facing="left"
            size={185}
            animKey="verdict"
          />
        </div>

        {/* Trophy / Skull Championship Emblem */}
        {won ? (
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full border border-amber-400/40 bg-amber-500/20 text-3xl shadow-[0_0_24px_rgba(251,191,36,0.6)] animate-pop-in">
            🏆
          </div>
        ) : (
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full border border-red-500/40 bg-red-500/20 text-3xl shadow-[0_0_24px_rgba(239,68,68,0.5)] animate-pop-in">
            💀
          </div>
        )}

        <h3
          className={cn(
            "mt-2 animate-verdict-slam text-4xl font-black tracking-wide sm:text-5xl",
            won
              ? "bg-gradient-to-r from-emerald-300 via-lime-200 to-emerald-300 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(16,185,129,0.6)]"
              : "bg-gradient-to-r from-red-400 via-rose-300 to-red-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(239,68,68,0.6)]",
          )}
        >
          {won ? "VICTORY" : "DEFEATED"}
        </h3>

        {won ? (
          <p className="mt-3 text-sm text-zinc-300">
            {challengerName} claimed{" "}
            <span className="font-bold text-emerald-300">
              +{formatMon(outcome.payout > 0n ? outcome.payout : outcome.pot)} MON
            </span>{" "}
            in Duel #{outcome.duelId} (2 Rounds Won)
          </p>
        ) : (
          <p className="mt-3 text-sm text-zinc-300">
            {challengerName} lost{" "}
            <span className="font-semibold text-zinc-200">
              {formatMon(outcome.wager)} MON
            </span>{" "}
            to {creatorName} in Duel #{outcome.duelId}
          </p>
        )}

        {clutch && (
          <p className="mx-auto mt-4 inline-block animate-pop-in rounded-full border border-orange-400/50 bg-orange-500/15 px-4 py-1.5 text-xs font-extrabold tracking-wide text-orange-200 shadow-[0_0_18px_rgba(251,146,60,0.5)]">
            🔥 CLUTCH RESURRECTION WIN
          </p>
        )}

        {/* Second Wind coaching prompt on a plain loss */}
        {!won && !outcome.secondWind && (
          <p className="mx-auto mt-3 max-w-sm text-[11px] leading-relaxed text-zinc-500">
            💡 Hold a Chog NFT for a 20% chance of Second Wind resurrection —
            it could have saved this duel.
          </p>
        )}
        {!won && outcome.userResurrected && (
          <p className="mx-auto mt-3 max-w-sm text-[11px] leading-relaxed text-purple-300/80">
            Your Second Wind fired, but sudden death went against you.
          </p>
        )}
        {!won && outcome.secondWind && !outcome.userResurrected && revivedName && (
          <p className="mx-auto mt-3 max-w-sm text-[11px] leading-relaxed text-zinc-500">
            {revivedName}&apos;s Second Wind turned the tide — grab a Chog NFT
            to fight back next time.
          </p>
        )}

        {/* Post-match actions — two distinct arcade buttons, never merged */}
        <div className="mt-6 flex w-full flex-col items-center justify-center gap-4 sm:flex-row">
          <button
            type="button"
            onClick={onPlayAgain ?? onClose}
            disabled={onPlayAgainBusy}
            className="flex w-full flex-1 items-center justify-center gap-2 rounded-xl border border-pink-400/30 bg-gradient-to-r from-pink-600 to-purple-600 px-6 py-3.5 font-bold uppercase tracking-wider text-white shadow-lg shadow-pink-600/30 transition-all hover:from-pink-500 hover:to-purple-500 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
          >
            {onPlayAgainBusy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Confirm stake in wallet…
              </>
            ) : (
              <>
                <Swords className="h-4 w-4" aria-hidden />
                Play Again / Rematch
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex w-full flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 bg-black/50 px-6 py-3.5 font-bold uppercase tracking-wider text-zinc-300 transition-all hover:border-white/30 hover:bg-black/70 hover:text-white sm:w-auto"
          >
            Back to Lobby
          </button>
        </div>
        {outcome.txHash && explorerTxUrl && (
          <div className="mt-4 flex justify-center">
            <a
              href={explorerTxUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-mono text-[11px] text-zinc-500 underline-offset-2 transition hover:text-zinc-300 hover:underline"
            >
              <ExternalLink className="h-3 w-3" aria-hidden />
              View tx {truncateAddress(outcome.txHash)}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
