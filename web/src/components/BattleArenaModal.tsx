"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import dynamic from "next/dynamic";
import { ExternalLink, Loader2, Swords } from "lucide-react";
import { FIGHTER_CLASS_META, type FighterClass } from "@/config/fighterClasses";
import { has3DModel, type FighterActionState } from "@/config/fighterModels";
import type { StageRigStatus } from "./Fighter3D";
import { stageAnchorX } from "@/config/stageLayout";
import { setChogScene } from "@/lib/chogTheme";
import type { StageFighter3D } from "./Fighter3D";

/* three.js + R3F are heavy â€” load the 3D layer only when a duel starts. */
const FighterStage3D = dynamic(
  () => import("./Fighter3D").then((m) => m.FighterStage3D),
  { ssr: false },
);

export type SpriteState =
  | "idle"
  | "dashIn"
  | "attack"
  | "stagger"
  | "dashOut"
  | "hit"
  | "secondWind"
  | "dead"
  | "victory";

import {
  getFighterMoveSet,
  impactCueFor,
  type SpecialMove,
} from "@/data/fighterMoves";
import { cn, formatMon, truncateAddress } from "@/lib/utils";
import {
  ChugArena,
  type ChugBattleEvent,
  type ChugSide,
} from "@/utils/chug";
import {
  playDashSfx,
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

/**
 * Map the simulation onto the 3D animation states â€” every strike kind gets
 * its own Mixamo clip (light / heavy / special / critical).
 */

/* ------------------------------------------------------------------ tuning */

const MOVE_SPEED = 24; // %/s player slide speed

/**
 * How long each strike's animation is held, so the full Mixamo clip can
 * play instead of being cut off after the first few frames. The clips run
 * 2-5s, the old pose window was only ~300ms â€” that is why the fighters
 * looked frozen.
 */
const ACTION_HOLD: Record<AttackKind, number> = {
  light: 1150,
  heavy: 1550,
  special: 2100,
  critical: 2600,
};

/** How long a hit reaction is held so the flinch clip can finish. */
const HIT_HOLD = 640;

/**
 * The pre-match "READY?" intro. The countdown is PAUSED while the 3D rigs
 * stream in and the canvas paints them â€” it only starts running once the
 * stage is playable, so the round never opens on a cold, stalling canvas.
 */
const FACE_OFF_MS = 2500;

/**
 * How long the arena waits for the 3D layer to report in before it gives
 * up and starts the match anyway. A rig that never loads must not freeze
 * the whole fight.
 */
const STAGE_LOAD_GRACE_MS = 20_000;

/**
 * Per-archetype windup timings (ms).
 */
const WINDUP_FOR: Record<FighterClass, Record<AttackKind, number>> = {
  chogzila: { light: 160, heavy: 400, special: 420, critical: 500 },
  chog_samurai: { light: 110, heavy: 220, special: 300, critical: 380 },
  void_lord_james: { light: 150, heavy: 260, special: 320, critical: 400 },
  crimson_lord_benja: { light: 90, heavy: 180, special: 260, critical: 320 },
  lady_chog: { light: 100, heavy: 200, special: 280, critical: 360 },
  chog_princess: { light: 120, heavy: 220, special: 300, critical: 380 },
};
const RECOVER_FOR: Record<FighterClass, Record<AttackKind, number>> = {
  chogzila: { light: 220, heavy: 420, special: 360, critical: 440 },
  chog_samurai: { light: 140, heavy: 240, special: 280, critical: 340 },
  void_lord_james: { light: 180, heavy: 260, special: 300, critical: 360 },
  crimson_lord_benja: { light: 100, heavy: 200, special: 260, critical: 320 },
  lady_chog: { light: 120, heavy: 220, special: 280, critical: 340 },
  chog_princess: { light: 140, heavy: 240, special: 300, critical: 360 },
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
/** Center-to-center reach (stage %) for each attack â€” shared with the AI
 *  agent so the brain and the hit detection always agree on what lands. */
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
const TRACK_LEFT: [number, number] = [10, 38.5];
const TRACK_RIGHT: [number, number] = [61.5, 90];

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


type FighterRT = {
  side: FighterSide;
  x: number;
  hp: number;
  meter: number;
  pose: SpriteState;
  seq: number;
  facing: "left" | "right";
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
  /** The strike currently being animated â€” drives which Mixamo clip plays. */
  actionKind: AttackKind | null;
  /** ms left on the current animation, so the clip can play to its end. */
  actionTimer: number;
  /** ms left on the current hit reaction. */
  hitTimer: number;
  /** ms until this fighter picks its next action (AI cadence timer). */
  nextActionMs: number;
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
  /** One local AI brain per fighter â€” stepped every frame by the game loop. */
  chug: ChugArena;
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
  cinematic: { id: number; kind: "critical" | "special" | "ko"; moveName?: string } | null;
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
  /** K.O. banner, shown above the fighters after the knock-out animation. */
  koBanner: string | null;
  /** ms before the K.O. banner appears. */
  koBannerDelayMs: number;
  /** ms the K.O. banner stays up. */
  koBannerMs: number;
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

/**
 * Where a fighter actually stands on screen. The 3D rigs are locked to
 * fixed slots; the sim's `x` still wanders inside a track, and painting
 * damage on that wandering x stuck the numbers on the wrong body.
 */
function anchorX(side: FighterSide, script: MatchScript): number {
  const cls = side === "creator" ? script.creatorClass : script.challengerClass;
  if (cls === "chog_princess") return 28;
  if (cls === "void_lord_james") return 73;
  return side === "creator" ? 70 : 30;
}

function fighterLabel(name: string, fighterClass: FighterClass): string {
  const trimmed = name.trim();
  if (trimmed) return trimmed;
  return FIGHTER_CLASS_META[fighterClass].label;
}

function createMatch(
  script: MatchScript,
  playerSide: PlayerSide,
  fighters: Record<FighterSide, FighterDescriptor>,
): MatchState {
  const chugTimings = (cls: FighterClass) => ({
    startup: WINDUP_FOR[cls],
    recover: RECOVER_FOR[cls],
  });
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
    actionKind: null,
    actionTimer: 0,
    hitTimer: 0,
    nextActionMs: 600,
  });
  const m: MatchState = {
    stage: "faceoff",
    stageMs: 0,
    stageDur: FACE_OFF_MS,
    round: 1,
    timer: 99,
    orbs: { creator: 0, challenger: 0 },
    fighters: {
      creator: blank("creator", oppX, oppFacing, script.creatorClass === "chogzila" ? 130 : 100),
      challenger: blank("challenger", playerX, playerFacing, script.challengerClass === "chogzila" ? 130 : 100),
    },
    moves: {
      creator: getFighterMoveSet(script.creatorClass),
      challenger: getFighterMoveSet(script.challengerClass),
    },
    heldLeft: false,
    heldRight: false,
    heldBlock: false,
    attackQueued: null,
    chug: new ChugArena(
      {
        side: "creator",
        fighterClass: script.creatorClass,
        track: oppTrack(playerSide),
        isPlayer: false,
        timings: chugTimings(script.creatorClass),
        moves: getFighterMoveSet(script.creatorClass),
        hp: script.creatorClass === "chogzila" ? 130 : 100,
      },
      {
        side: "challenger",
        fighterClass: script.challengerClass,
        track: playerTrack(playerSide),
        isPlayer: true,
        timings: chugTimings(script.challengerClass),
        moves: getFighterMoveSet(script.challengerClass),
        hp: script.challengerClass === "chogzila" ? 130 : 100,
      },
    ),
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
    koBanner: null,
    koBannerDelayMs: 0,
    koBannerMs: 0,
    roundWinner: null,
    matchWinner: null,
  };
  /* chug owns the authoritative fight state — seed its corner positions
   * and the match's damage buffs so the sim starts in sync. */
  m.chug.fighters.creator.x = oppX;
  m.chug.fighters.challenger.x = playerX;
  m.chug.setBuff("creator", m.buffs.ai);
  m.chug.setBuff("challenger", m.buffs.player);
  return m;
}

/* ------------------------------------------------------------ view snapshot */

/**
 * Which Mixamo clip a fighter should be playing right now.
 *
 * The strike's animation outlives its damage window (ACTION_HOLD), so the
 * clip plays to the end instead of being cut after the first few frames â€”
 * that is what made the fighters look frozen mid-punch.
 */
function fighterActionState(f: FighterRT): FighterActionState {
  if (f.down) return "ko";
  if (f.pose === "victory") return "victory";
  if (f.hurtMs > 0 || f.hitTimer > 0) return "hit";
  if (f.blockHeld) return "block";
  switch (f.actionKind) {
    case "light":
      return "lightAttack";
    case "heavy":
      return "heavyAttack";
    case "special":
      return "special";
    case "critical":
      return "critical";
    default:
      return "idle";
  }
}

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
  /** Which animation the 3D rig should be playing right now. */
  action: FighterActionState;
};

type View = {
  stage: Stage;
  round: 1 | 2 | 3;
  timer: number;
  banner: string | null;
  koBanner: string | null;
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
  cinematic: { id: number; kind: "critical" | "special" | "ko"; moveName?: string } | null;
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
    action: fighterActionState(f),
  };
}

function snapshot(m: MatchState): View {
  return {
    stage: m.stage,
    round: m.round,
    timer: Math.max(0, Math.ceil(m.timer)),
    banner: m.bannerMs > 0 ? m.banner : null,
    koBanner: m.koBannerMs > 0 ? m.koBanner : null,
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
  /* the K.O. banner waits for the knock-out animation to finish */
  if (m.koBannerDelayMs > 0) {
    m.koBannerDelayMs -= dt;
    if (m.koBannerDelayMs <= 0) {
      m.koBannerDelayMs = 0;
      m.koBannerMs = 1100;
    }
  } else if (m.koBannerMs > 0) {
    m.koBannerMs -= dt;
    if (m.koBannerMs <= 0) m.koBanner = null;
  }
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
  else if (f.actionTimer > 0) pose = "attack";
  else if (f.hurtMs > 0 || f.hitTimer > 0) pose = f.hurtHeavy ? "stagger" : "hit";
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
  if (f.actionTimer > 0) {
    f.actionTimer -= dt;
    if (f.actionTimer <= 0) {
      f.actionTimer = 0;
      f.actionKind = null;
    }
  }
  if (f.hitTimer > 0) {
    f.hitTimer -= dt;
    if (f.hitTimer <= 0) f.hitTimer = 0;
  }
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
  p.hurtMs = 0;
  ai.hurtMs = 0;
  p.shieldMs = 0;
  ai.shieldMs = 0;
  p.stunMs = 0;
  ai.stunMs = 0;
  p.blockHeld = false;
  ai.blockHeld = false;
  /* clear the running animations so the next round starts from a clean
   * idle (otherwise the hit flash/animation carries over). */
  p.actionKind = null;
  ai.actionKind = null;
  p.actionTimer = 0;
  ai.actionTimer = 0;
  p.hitTimer = 0;
  ai.hitTimer = 0;
  p.nextActionMs = 500;
  ai.nextActionMs = 500;
  /* A fresh round means a fresh brain â€” no leftover route, cooldown or
   * evade state carries into the next fight. */
  m.chug.reset();
  m.chug.setBuff("creator", m.buffs.ai);
  m.chug.setBuff("challenger", m.buffs.player);
  p.x = playerSide === "left" ? 32 : 68;
  ai.x = playerSide === "left" ? 68 : 32;
  m.chug.fighters.creator.x = ai.x;
  m.chug.fighters.challenger.x = p.x;
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
  m.stageDur = 2600;
  /* the knock-out animation gets 1.5s to play before the banner appears */
  m.banner = null;
  m.bannerMs = 0;
  m.koBanner = null;
  m.koBannerDelayMs = 0;
  m.koBannerMs = 0;
  m.koBanner = `ROUND ${m.round} K.O.`;
  m.koBannerDelayMs = 1500;
  m.koBannerMs = 1100;
  const loser = winner === "challenger" ? m.fighters.creator : m.fighters.challenger;
  const win = winner === "challenger" ? m.fighters.challenger : m.fighters.creator;
  loser.down = true;
  loser.pose = "dead";
  loser.seq += 1;
  /* the K.O. clip has to be able to take over from the strike that landed */
  loser.actionKind = null;
  loser.actionTimer = 0;
  loser.hitTimer = 0;
  win.pose = "victory";
  win.seq += 1;
  win.actionKind = null;
  win.actionTimer = 0;
  m.cinematic = { id: ++m.fxId, kind: "ko" };
  m.cinematicMs = 750;
  /* The knock-out strike that emptied the health bar already sounded when
   * it landed — the K.O. adds no second impact. */
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
  ai.blockHeld = false;
  m.buffs.player *= 1.4;
  /* chug stays authoritative: resurrect, re-stun, and rebuff inside sim */
  m.chug.resurrect("challenger", 55);
  m.chug.fighters.creator.hurtMs = 3000;
  m.chug.setBuff("challenger", m.buffs.player);
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
  m.chug.resurrect("creator", Math.max(m.chug.fighters.creator.hp, 50));
  m.chug.setBuff("creator", m.buffs.ai);
  m.aiAction = { kind: "telegraph", attack: "critical", dur: 300 };
  m.aiActionMs = 0;
  m.aiNextMs = 400;
}

/**
 * chug event -> presentation. chug runs the whole battle and reports what
 * happened; this is the ONLY place a swing or an impact is allowed to
 * make a sound: swing the instant a strike starts, impact only on a
 * verified active-frame connection.
 */
function handleChugEvent(
  m: MatchState,
  ev: ChugBattleEvent,
  script: MatchScript,
  playerSide: PlayerSide,
) {
  switch (ev.type) {
    case "swing": {
      const f = m.fighters[ev.side];
      /* swing SFX belongs to the ATTACK, not the hit */
      playDashSfx();
      f.actionKind = ev.kind;
      f.actionTimer = ACTION_HOLD[ev.kind];
      f.activeMoveName = ev.moveName ?? null;
      f.seq += 1;
      break;
    }
    case "connect":
      presentHit(m, ev, script);
      break;
    case "whiff":
      /* clean miss — the swing already sounded, nothing else happens */
      break;
    case "ko": {
      const winner: FighterSide =
        ev.loser === "creator" ? "challenger" : "creator";
      if (
        ev.loser === "challenger" &&
        script.playerWon &&
        !m.shieldUsed &&
        m.orbs.challenger >= 1
      ) {
        triggerSecondWind(m, m.fighters.challenger);
      } else if (
        ev.loser === "creator" &&
        !script.playerWon &&
        !m.overdrive &&
        m.orbs.creator >= 1
      ) {
        triggerOverdrive(m, m.fighters.creator);
      } else {
        startKO(m, winner, script, playerSide);
      }
      break;
    }
  }
}

/**
 * Present a verified chug connection: damage numbers, hit-stop, camera
 * shake, combo counter, cinematic cut-ins — and the ONE impact sound per
 * landed hit. Everything here is cosmetic; chug already applied the
 * damage.
 */
function presentHit(
  m: MatchState,
  ev: Extract<ChugBattleEvent, { type: "connect" }>,
  script: MatchScript,
) {
  const attacker = m.fighters[ev.side];
  const defender = m.fighters[ev.foeSide];
  const defenderX = anchorX(defender.side, script);
  const attackerX = anchorX(attacker.side, script);

  m.impact = { id: ++m.fxId, x: defenderX };
  m.impactMs = 380;
  m.hurtFx = { id: ++m.fxId, x: defenderX, bright: true };
  m.hurtFxMs = 430;
  m.dust = { id: ++m.fxId, x: attackerX };
  m.dustMs = 500;
  if (ev.blocked) {
    m.guard = { id: ++m.fxId, x: defenderX };
    m.guardMs = 300;
  }
  const multi = ev.move && ev.move.hitCount > 1 ? ev.move.hitCount : undefined;
  m.hits.push({
    id: ++m.fxId,
    side: defender.side,
    dmg: ev.dmg,
    crit: ev.crit && !ev.blocked,
    multi,
    name:
      ev.kind === "special" || ev.kind === "critical" ? ev.move?.name : undefined,
    ms: 950,
  });
  if (m.hits.length > 6) m.hits.shift();

  // 90ms arcade hit-stop freeze on heavy hits
  m.hitStopMs = ev.kind === "light" ? 60 : 90;
  m.camShakeMs = ev.kind === "light" ? 280 : 440;
  /* ONE impact sound per landed hit — only on chug's verified connect. */
  if (ev.move) playImpactSfx(impactCueFor(ev.move.soundCue));
  else
    playImpactSfx(ev.crit ? "crit" : ev.kind === "heavy" ? "slam" : "slash");

  defender.hurtMs = ev.kind === "light" ? 220 : 340;
  defender.hurtHeavy = ev.kind !== "light";
  /* hold the flinch clip long enough to read, not just one hit-stop frame */
  defender.hitTimer = HIT_HOLD;
  defender.actionKind = null;
  defender.actionTimer = 0;
  defender.hurtBright = true;
  defender.seq += 1;

  if (attacker.side === "challenger") {
    m.combo = {
      id: ++m.fxId,
      count: (m.combo?.count ?? 0) + (ev.move?.hitCount ?? 1),
    };
    m.comboMs = 1500;
  }
  if (ev.kind === "special" || ev.kind === "critical") {
    /* a signature move gets a light banner (the animation must stay
     * visible); only the critical art gets the full screen cut-in. */
    m.cinematic = {
      id: ++m.fxId,
      kind: ev.kind === "critical" ? "critical" : "special",
      moveName: ev.move?.name,
    };
    m.cinematicMs = ev.kind === "critical" ? 1100 : 900;
    m.moveFx = {
      id: ++m.fxId,
      x: defenderX,
      vfx: ev.move!.vfxType,
      kind: ev.kind === "critical" ? "critical" : "special",
    };
    m.moveFxMs = MOVE_FX_MS[ev.move!.vfxType];
  }
}

/**
 * Copy chug's authoritative fight state (positions, hp, meter) into the
 * presentation mirror, and feed chug the live shield state so Second Wind
 * invulnerability eats strikes inside the sim.
 */
function syncChugState(m: MatchState) {
  for (const side of ["creator", "challenger"] as const) {
    const cf = m.chug.fighters[side];
    const f = m.fighters[side];
    f.x = cf.x;
    f.hp = cf.hp;
    f.meter = cf.meter;
  }
  const p = m.fighters.challenger;
  const ai = m.fighters.creator;
  m.chug.invulnerable = {
    challenger: p.shieldMs > 0,
    creator: ai.shieldMs > 0,
  };
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
  fighters: Record<FighterSide, FighterDescriptor>,
) {
  m.timer -= dt / 1000;
  if (m.timer <= 0) {
    resolveTimer(m, script, playerSide);
    return;
  }
  const p = m.fighters.challenger;
  const ai = m.fighters.creator;

  /* chug runs the entire battle — brains, movement, strike phases, hit
   * validation, damage — and reports events for presentation. */
  const events = m.chug.step(dt);
  for (const ev of events) handleChugEvent(m, ev, script, playerSide);

  tickFighter(p, dt);
  tickFighter(ai, dt);
  syncChugState(m);
  syncMechanics(m, script);
}

function step(
  m: MatchState,
  dt: number,
  script: MatchScript,
  playerSide: PlayerSide,
  fighters: Record<FighterSide, FighterDescriptor>,
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
      updateFight(m, dt, script, playerSide, fighters);
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
  /** Verdict "Play Again" â€” re-runs the on-chain stake flow for a rematch. */
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
  action: "idle",
};

const initialView: View = {
  stage: "faceoff",
  round: 1,
  timer: 99,
  banner: null,
  koBanner: null,
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
  playerSide: _playerSide = "left",
  onPlayAgain,
  onPlayAgainBusy = false,
  onClose,
}: BattleArenaModalProps) {
  const [view, setView] = useState<View>(initialView);

  /* The stage layout is fixed by CHARACTER, not by role: Chog Princess
   * always stands to the left of the CWO lettering and Void Lord James to
   * the right, so they always flank the logo instead of crossing it. */
  const playerSide: PlayerSide =
    challengerFighter.fighterClass === "chog_princess" ? "left" : "right";

  /* Manual best-of-3 round scoreboard. Refs are the authoritative counters
   * (updated synchronously inside the rAF loop); state mirrors them for
   * rendering. The final verdict is decided ONLY from these counts. */
  const playerWinsRef = useRef(0);
  const opponentWinsRef = useRef(0);
  const [playerWins, setPlayerWins] = useState(0);
  const [opponentWins, setOpponentWins] = useState(0);

  const matchRef = useRef<MatchState | null>(null);
  const viewRef = useRef<View>(initialView);

  /* ================= 3D FIGHTER LAYER =================
   * Fighters that ship a rigged Meshy model are drawn in a transparent R3F
   * canvas that sits behind the 2D sprites; everyone else keeps the 2D
   * treatment. The array is mutated in place every frame so the canvas
   * never re-renders â€” it just reads the latest values in useFrame. */
  const fighters3DRef = useRef<StageFighter3D[]>([
    {
      side: "creator",
      fighterClass: creatorFighter.fighterClass,
      state: "idle",
      x: 68,
      facing: "left",
    },
    {
      side: "challenger",
      fighterClass: challengerFighter.fighterClass,
      state: "idle",
      x: 32,
      facing: "right",
    },
  ]);
  /* ================= 3D STAGE READINESS =================
   * The 3D layer streams ~200MB of Mixamo rigs before the bell. The match
   * is HELD in the face-off until every rigged fighter reports that it is
   * loaded, textured, bound to its clips and has painted a frame â€” that is
   * what keeps the opening punch off a cold, stalling canvas. */
  const [rigStatus, setRigStatus] = useState<Record<FighterSide, StageRigStatus>>(
    {
      creator: { side: "creator", progress: 0, ready: false, failed: false },
      challenger: {
        side: "challenger",
        progress: 0,
        ready: false,
        failed: false,
      },
    },
  );
  const handle3DStatus = useCallback((status: StageRigStatus) => {
    setRigStatus((prev) => {
      const current = prev[status.side];
      /* The state only ever moves FORWARD: a rig that reported ready stays
       * ready, even when the endgame clips keep streaming in behind the
       * fight. */
      if (current.ready || current.failed) return prev;
      if (
        current.ready === status.ready &&
        current.failed === status.failed &&
        current.progress === status.progress
      ) {
        return prev;
      }
      return { ...prev, [status.side]: status };
    });
  }, []);

  /* Only the fighters that actually ship a rig gate the start. */
  const gatedSides = useMemo<FighterSide[]>(() => {
    const sides: FighterSide[] = [];
    if (has3DModel(creatorFighter.fighterClass)) sides.push("creator");
    if (has3DModel(challengerFighter.fighterClass)) sides.push("challenger");
    return sides;
  }, [creatorFighter.fighterClass, challengerFighter.fighterClass]);

  /* The stage is playable once every rigged fighter has reported in â€”
   * either ready, or failed (a broken rig must not freeze the match). */
  const stageReady = gatedSides.every(
    (side) => rigStatus[side].ready || rigStatus[side].failed,
  );
  const stageReadyRef = useRef(stageReady);
  stageReadyRef.current = stageReady;

  /* Safety net: a rig that never reports in (a hung fetch) must not freeze
   * the match â€” after the grace period the stage is released anyway. */
  useEffect(() => {
    const t = setTimeout(() => {
      setRigStatus((prev) => {
        const next = { ...prev };
        for (const side of ["creator", "challenger"] as const) {
          if (!next[side].ready && !next[side].failed) {
            next[side] = { ...next[side], failed: true, progress: 1 };
          }
        }
        return next;
      });
    }, STAGE_LOAD_GRACE_MS);
    return () => clearTimeout(t);
  }, []);

  const nameOf = (side: FighterSide): string =>
    side === "creator" ? creatorFighter.name : challengerFighter.name;

  /* Winner/loser sides + Second Wind resolution â€” computed once. */
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

  /* ================= THE THEME TRACK STEPS ASIDE =================
   * The arena runs its own combat sound - impacts, dashes, the round
   * announcer - so the lobby theme fades out and stops for the duration
   * of the fight, then picks itself back up at ambient level when the
   * visitor walks back out to the lobby. */
  useEffect(() => {
    setChogScene("arena");
    return () => setChogScene("lobby");
  }, []);

  /* ================= REAL-TIME GAME LOOP =================
   * Single rAF loop: step the ref-based match state, then mirror a plain
   * view object into React state for rendering. Never re-triggered by view
   * updates â€” only by isOpen + a fresh confirmed outcome. */
  useEffect(() => {
    if (!isOpen || !outcome || !script) return;
    resetArenaAudio();
    const m = createMatch(script, playerSide, {
    creator: creatorFighter,
    challenger: challengerFighter,
  });
    matchRef.current = m;
    const snap = snapshot(m);
    viewRef.current = snap;
    setView(snap);

    let raf = 0;
    let last = performance.now();
    let lastPaint = 0;
    /** the READY? clock â€” it only runs while the stage is playable */
    let faceoffClock = 0;
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
      /* The READY? countdown is PAUSED until the 3D stage is playable: the
       * clock only advances once every rig has landed, been textured, bound
       * its clips and painted a frame. The round therefore never opens on a
       * cold canvas â€” that was the opening freeze. */
      if (m.stage === "faceoff") {
        if (stageReadyRef.current) faceoffClock += dt;
        m.stageMs = faceoffClock;
      }
      step(m, dt, script, playerSide, {
      creator: creatorFighter,
      challenger: challengerFighter,
    }, onRoundWin);

      /* Mirror the fight state into the 3D layer every frame (mutated in
       * place â€” the canvas does not re-render). React only paints when the
       * HUD actually changes, otherwise setState-every-frame stalls the
       * overlay several seconds behind the audio and the hit markers. */
      for (const entry of fighters3DRef.current) {
        const f = m.fighters[entry.side];
        entry.x = f.x;
        entry.facing = f.facing;
        entry.state = fighterActionState(f);
      }

      const stageChanged = m.stage !== viewRef.current.stage;
      const hudDue = now - lastPaint > 90;
      if (stageChanged || hudDue) {
        lastPaint = now;
        const next = snapshot(m);
        viewRef.current = next;
        setView(next);
      }
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

  if (!outcome || !script) return null;

  const revivedName = script.revivedSide ? nameOf(script.revivedSide) : null;
  const leftSide: FighterSide = playerSide === "left" ? "challenger" : "creator";
  const rightSide: FighterSide = leftSide === "challenger" ? "creator" : "challenger";
  const leftDesc = leftSide === "challenger" ? challengerFighter : creatorFighter;
  const rightDesc = rightSide === "challenger" ? challengerFighter : creatorFighter;

  /* Dynamic Stage Camera & Zoom â€” subtle push-in as the fighters close, with
   * the pivot low enough that the 3D fighters never clip out of frame. */
  const dist = Math.abs(view.fighters.creator.x - view.fighters.challenger.x);
  const closeRatio = Math.max(0, Math.min(1, (65 - dist) / 45));
  const isCriticalArt = view.cinematic?.kind === "critical";
  const cameraScale = isCriticalArt ? 1.1 : 1.0 + closeRatio * 0.05;
  const midX = (view.fighters.creator.x + view.fighters.challenger.x) / 2;
  const cameraPanX = (50 - midX) * 0.22;

  /* The match winner is decided STRICTLY from the manual round scoreboard â€”
   * never from the pre-rolled on-chain outcome. First to 2 round wins. */
  const manualPlayerWon = playerWins >= 2;
  const leftWins = leftSide === "challenger" ? playerWins : opponentWins;
  const rightWins = rightSide === "challenger" ? playerWins : opponentWins;

  return (
    <div className="fixed inset-0 z-[95] flex h-[100dvh] items-center justify-center bg-black/90 p-2 backdrop-blur-sm sm:h-[92vh] sm:p-4">
      <div
        className="relative flex h-full max-h-full w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-red-500/30 bg-zinc-950 shadow-[0_0_70px_-10px_rgba(239,68,68,0.3)]"
        role="dialog"
        aria-modal="true"
      >
        {/* ============ ARCADE HUD ============ */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-3 border-b border-white/10 bg-black/80 px-4 pb-2.5 pt-3 sm:px-5">
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
                  {view.round === 3 ? "FINAL ROUND" : `ROUND ${view.round}`} Â· Orbs{" "}
                  <span className="text-amber-300">
                    {leftWins}â€“{rightWins}
                  </span>
                </p>
              </div>
              <HudSide
                fighter={rightDesc}
                hp={view.fighters[rightSide].hp}
                align="right"
              />
            </div>

            {/* ============ 3D BATTLE STAGE ============ */}
            <div
              className={cn(
                "relative min-h-[380px] flex-1 overflow-hidden sm:min-h-[560px]",
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
                  transformOrigin: "50% 90%",
                }}
              >
                {/* Soft floor light instead of a dark gradient slab */}
                <div
                  className="absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-t from-[#2a1d4d]/55 via-[#241a3d]/20 to-transparent"
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

                {/* Arena floor â€” perspective grid only, no dark slab */}
                <div className="absolute inset-x-0 bottom-0 h-[38%]">
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
                    { left: "18%", top: "30%", glyph: "á›" },
                    { left: "48%", top: "55%", glyph: "á›Ÿ" },
                    { left: "76%", top: "25%", glyph: "á›‰" },
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

                {/* Ambient fighter lighting â€” soft backlight spots */}
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

                {/* 3D fighter layer â€” the canvas IS the stage: rigged Mixamo
                    meshes, lit and animated, filling the whole viewport. */}
                {(has3DModel(creatorFighter.fighterClass) ||
                  has3DModel(challengerFighter.fighterClass)) && (
                  <FighterStage3D
                    fightersRef={fighters3DRef}
                    onStatus={handle3DStatus}
                  />
                )}

                {/* Floating damage numbers anchored to each 3D fighter */}
                {(["creator", "challenger"] as const).map((side) => {
                  const cls =
                    side === "creator"
                      ? creatorFighter.fighterClass
                      : challengerFighter.fighterClass;
                  const foeCls =
                    side === "creator"
                      ? challengerFighter.fighterClass
                      : creatorFighter.fighterClass;
                  /* the anchor follows the fighter's stage slot, so the
                   * number stays on the body that was actually hit */
                  const x = stageAnchorX(side, cls, foeCls);
                  return (
                  <div
                    key={`dmg-${side}`}
                    className="pointer-events-none absolute bottom-[58%] z-[40]"
                    style={{
                      left: `${x}%`,
                      transform: "translateX(-50%)",
                    }}
                    aria-hidden
                  >
                    {view.hits
                      .filter((h) => h.side === side)
                      .map((h) => (
                        <DamageNumber key={h.id} hit={h} />
                      ))}
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

              {/* Cinematic camera: vignette + color flash + big arcade text.
                  A signature move only gets a light banner so the Mixamo
                  animation stays visible behind it. */}
              {view.cinematic && view.cinematic.kind !== "special" && (
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
                    {view.cinematic.kind === "ko" ? null : (
                      <p
                        className={cn(
                          "cinematic-text whitespace-nowrap font-black italic tracking-[0.12em]",
                          view.cinematic.kind === "critical" &&
                            "text-5xl bg-gradient-to-r from-red-400 via-amber-300 to-red-500 bg-clip-text text-transparent drop-shadow-[0_0_24px_rgba(239,68,68,0.9)] sm:text-6xl",
                        )}
                      >
                        CRITICAL ART
                      </p>
                    )}
                    {view.cinematic.moveName && (
                      <p className="cinematic-move-name whitespace-nowrap text-xs font-black uppercase tracking-[0.35em] text-white/90 drop-shadow-[0_0_12px_rgba(255,255,255,0.6)] sm:text-sm">
                        {view.cinematic.moveName}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Signature move â€” a light banner, the animation plays through */}
              {view.cinematic?.kind === "special" && (
                <div
                  key={`spec-${view.cinematic.id}`}
                  className="pointer-events-none absolute inset-x-0 top-6 z-[31] flex justify-center"
                  aria-live="assertive"
                >
                  <div className="rounded-full border border-fuchsia-400/40 bg-black/70 px-5 py-1.5 text-center text-[10px] font-black uppercase tracking-[0.3em] text-fuchsia-200 drop-shadow-[0_0_12px_rgba(232,121,249,0.7)] sm:text-xs">
                    {view.cinematic.moveName ?? "SIGNATURE MOVE"}
                  </div>
                </div>
              )}

              {/* K.O. banner â€” sits ABOVE the fighters, never on the body */}
              {view.koBanner && (
                <div
                  className="pointer-events-none absolute inset-x-0 top-8 z-[33] flex justify-center"
                  aria-live="assertive"
                >
                  <div className="animate-round-banner text-center">
                    <p className="whitespace-nowrap bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-200 bg-clip-text text-4xl font-black tracking-[0.15em] text-transparent drop-shadow-[0_0_26px_rgba(251,191,36,0.85)] sm:text-5xl">
                      {view.koBanner}
                    </p>
                  </div>
                </div>
              )}

              {/* Banner overlays: ROUND N // FIGHT!, sync events */}
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

              {/* Face-off intro â€” the READY? countdown only starts once the
                  3D stage has finished loading and painting the fighters. */}
              {view.stage === "faceoff" && (
                <div className="pointer-events-none absolute inset-0 z-[34] flex items-center justify-center">
                  <div className="flex flex-col items-center gap-2">
                    {stageReady && (
                      <p className="animate-pop-in whitespace-nowrap bg-gradient-to-r from-red-300 via-amber-200 to-orange-300 bg-clip-text text-4xl font-black tracking-widest text-transparent drop-shadow-[0_0_22px_rgba(239,68,68,0.9)] sm:text-5xl">
                        ⚔️ READY?
                      </p>
                    )}
                    <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-zinc-400">
                      {nameOf(leftSide)} vs {nameOf(rightSide)} Â· Best of 3
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
                        {view.shieldFx.kind === "secondwind" ? "ðŸ›¡ï¸" : "âš¡"}
                      </p>
                      <h3 className="mt-3 bg-gradient-to-r from-purple-200 via-amber-200 to-purple-200 bg-clip-text text-xl font-extrabold tracking-wide text-transparent sm:text-2xl">
                        {view.shieldFx.kind === "secondwind"
                          ? "MONAD SECOND WIND"
                          : "AI BOSS OVERDRIVE"}
                      </h3>
                      <p className="mt-1.5 text-xs font-bold uppercase tracking-widest text-purple-300">
                        {view.shieldFx.kind === "secondwind"
                          ? "ADRENALINE SHIELD Â· 20% CHOG NFT PERK"
                          : "CRITICAL ART ENGAGED"}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* ================= FINAL VERDICT =================
                Overlays the live 3D stage, so the K.O. / victory animation
                keeps playing behind the payout panel. */}
            {view.stage === "verdict" && (
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
            )}
        </div>
    </div>
  );
}

/* ------------------------------------------------------------- arcade HUD */

function HudSide({
  fighter,
  hp,
  align,
}: {
  fighter: FighterDescriptor;
  hp: number;
  align: "left" | "right";
}) {
  const theme = FIGHTER_CLASS_META[fighter.fighterClass];
  const label = fighterLabel(fighter.name, fighter.fighterClass);
  /* P1 keeps the red -> purple brand gradient, P2 the blue -> indigo one;
   * both fall back to amber then red as their HP drops. */
  const barColor =
    align === "left"
      ? hp > 50
        ? "from-red-600 to-purple-600"
        : hp > 25
          ? "from-amber-500 to-red-600"
          : "from-rose-600 to-red-700"
      : hp > 50
        ? "from-blue-600 to-indigo-600"
        : hp > 25
          ? "from-amber-500 to-blue-700"
          : "from-rose-600 to-red-700";

  return (
    <div className="min-w-0 w-full">
      <div
        className={cn(
          "mb-1 flex min-w-0 items-center gap-2",
          align === "right" && "flex-row-reverse",
        )}
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{
            background: theme.secondary,
            boxShadow: `0 0 8px ${theme.primary}`,
          }}
          aria-hidden
        />
        <p
          className={cn(
            "min-w-0 flex-1 truncate text-xs font-extrabold text-zinc-100",
            align === "right" && "text-right",
          )}
        >
          {label}
        </p>
        <p
          className={cn(
            "shrink-0 font-mono text-[11px] font-bold tabular-nums",
            hp > 50
              ? "text-emerald-300"
              : hp > 25
                ? "text-amber-300"
                : "text-red-300",
          )}
        >
          {hp}
          <span className="text-zinc-500">/100</span>
        </p>
      </div>
      <div
        className="h-3 w-full overflow-hidden border border-white/15 bg-black/70"
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
      {hit.crit ? (
        <span className="ml-1 text-[11px] font-bold tracking-[0.2em] text-amber-200">
          //CRIT
        </span>
      ) : null}
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
 * spark flyout, and a sleek white core flash â€” no cartoon explosions.
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

/** Soft radial red/white flash over the staggered defender (blurred â€” no hard box). */
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

/** Warlord Chogzilla â€” ground-pound shockwave, blade trail, magma particles. */
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

/** Chog chog_samurai â€” multi-slash streaks, crescent plasma beam, sparks. */
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

/** VOID CLAW SLAM â€” shockwave ring + jagged lightning + void runes. */
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
      {["áš ", "áš¢", "áš¦", "áš¨"].map((glyph, i) => (
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

/** Keone void_lord_james signature â€” holographic purple/magenta portal + lightning burst. */
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

  return (
    <div
      className={cn(
        "absolute inset-0 z-40 flex flex-col items-center justify-center overflow-y-auto px-6 py-8 text-center backdrop-blur-[3px]",
        won
          ? "bg-gradient-to-b from-emerald-950/45 via-zinc-950/35 to-zinc-950/60"
          : "bg-gradient-to-b from-rose-950/45 via-zinc-950/35 to-zinc-950/60",
      )}
      aria-live="assertive"
    >
      <div className="relative z-10">
        {/* Trophy / Skull Championship Emblem */}
        {won ? (
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full border border-amber-400/40 bg-amber-500/20 text-3xl shadow-[0_0_24px_rgba(251,191,36,0.6)] animate-pop-in">
            ðŸ†
          </div>
        ) : (
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full border border-red-500/40 bg-red-500/20 text-3xl shadow-[0_0_24px_rgba(239,68,68,0.5)] animate-pop-in">
            ðŸ’€
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

        <p className="mt-1 text-sm font-black uppercase tracking-[0.25em] text-white/80">
          {(won ? challengerName : creatorName)}
        </p>

        {won ? (
          <p className="mt-3 text-sm font-semibold text-zinc-100 drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
            {challengerName} claimed{" "}
            <span className="font-bold text-emerald-300">
              +{formatMon(outcome.payout > 0n ? outcome.payout : outcome.pot)} MON
            </span>{" "}
            in Duel #{outcome.duelId} (2 Rounds Won)
          </p>
        ) : (
          <p className="mt-3 text-sm font-semibold text-zinc-100 drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
            {challengerName} lost{" "}
            <span className="font-semibold text-zinc-200">
              {formatMon(outcome.wager)} MON
            </span>{" "}
            to {creatorName} in Duel #{outcome.duelId}
          </p>
        )}

        {clutch && (
          <p className="mx-auto mt-4 inline-block animate-pop-in rounded-full border border-orange-400/50 bg-orange-500/15 px-4 py-1.5 text-xs font-extrabold tracking-wide text-orange-200 shadow-[0_0_18px_rgba(251,146,60,0.5)]">
            ðŸ”¥ CLUTCH RESURRECTION WIN
          </p>
        )}

        {/* Second Wind coaching prompt on a plain loss */}
        {!won && !outcome.secondWind && (
          <p className="mx-auto mt-3 max-w-sm text-[11px] leading-relaxed text-zinc-500">
            ðŸ’¡ Hold a Chog NFT for a 20% chance of Second Wind resurrection â€”
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
            {revivedName}&apos;s Second Wind turned the tide â€” grab a Chog NFT
            to fight back next time.
          </p>
        )}

        {/* Post-match actions â€” two distinct arcade buttons, never merged */}
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
                Confirm stake in walletâ€¦
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