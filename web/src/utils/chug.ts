import { Vector3 } from "three";
import type { FighterClass } from "@/config/fighterClasses";
import type { SpecialMove } from "@/data/fighterMoves";

/**
 * chug — the arena's battle agent.
 *
 * One clean system runs the entire fight:
 *
 *   - the strike phase machine (Startup → Active hitbox → Recovery),
 *   - active-frame hit validation (a blow may only land inside the active
 *     window, exactly once, and only at true 3D proximity),
 *   - the movement/input lockdown while a strike is in flight,
 *   - the per-character fighting brains (approach, cadence, strike picks),
 *   - damage, meter, hurt locks and K.O. detection.
 *
 * chug is a pure simulation: no timers, no audio, no React. The arena
 * steps it once per animation frame and reacts to the events it returns —
 * the SWING sound plays on a "swing" event, and the IMPACT sound only on
 * a verified "connect" event. Everything else (banners, FX, round flow)
 * stays presentation-side and simply reads chug's state.
 */

export type ChugAttackKind = "light" | "heavy" | "special" | "critical";
export type ChugPhase = "startup" | "active" | "recovery" | "done";
export type ChugSide = "creator" | "challenger";

/** Melee reach per strike kind, in stage-percent units. Tight, true
 * boxing range — a blow only lands when the bodies are properly in each
 * other's faces. */
export const CHUG_REACH: Record<ChugAttackKind, number> = {
  light: 13,
  heavy: 15,
  special: 17,
  critical: 19,
};

/** A fighter must stand still this long after moving before a strike may
 * start — walk in, plant, THEN punch. */
export const CHUG_SETTLE_MS = 140;

/** Forward drift while a strike is winding up. Slow on purpose: it is a
 * weight shift, not a dash. */
export const CHUG_LUNGE_SPEED = 5; // stage-%/s

/**
 * Character pushbox: the minimum stage-% gap between the two bodies.
 * Below this they are two solid masses — they push apart along the ground
 * plane instead of clipping through each other, no matter how the brains,
 * lunges or strikes move them.
 */
export const CHUG_PUSHBOX = 10;

/**
 * The active hitbox window, as a fraction of the FULL strike timeline
 * (startup + active + recovery). A punch may only land between 35% and
 * 65% of its animation — never during startup wind-up, never in recovery.
 */
export const CHUG_ACTIVE_WINDOW = { from: 0.35, to: 0.65 } as const;

/* ------------------------------------------------------------------ strikes */

export type ChugStrike = {
  kind: ChugAttackKind;
  /** ms of wind-up before any hitbox exists. */
  startupMs: number;
  /** elapsed ms after which the hitbox closes (65% of the timeline). */
  activeToMs: number;
  /** total strike duration; elapsed past this means the clip is over. */
  endMs: number;
  elapsed: number;
  /** True once the strike has connected — it can never land twice. */
  connected: boolean;
  /** True once the strike is over (connected, whiffed, or clanged). */
  resolved: boolean;
};

export type ChugTimings = {
  startup: Record<ChugAttackKind, number>;
  recover: Record<ChugAttackKind, number>;
};

/** Build a strike's phase timeline from the class windup/recover timings. */
export function chugBeginStrike(
  kind: ChugAttackKind,
  timings: ChugTimings,
): ChugStrike {
  const startupMs = timings.startup[kind];
  const total = startupMs + timings.recover[kind];
  /* The hitbox opens when startup ends (which is always ≥35% into the
   * timeline for these timings) and closes at the 65% mark — clamped so
   * every strike keeps at least a 40ms live window. */
  const activeTo = Math.max(startupMs + 40, CHUG_ACTIVE_WINDOW.to * total);
  return {
    kind,
    startupMs,
    activeToMs: activeTo,
    endMs: total,
    elapsed: 0,
    connected: false,
    resolved: false,
  };
}

export type ChugEvent =
  | "startup"
  | "connect-check"
  | "recovery"
  | "done";

/** Advance one strike by dt ms and report what phase the frame landed in. */
export function chugAdvance(strike: ChugStrike, dt: number): ChugEvent {
  strike.elapsed += dt;
  if (strike.elapsed < strike.startupMs) return "startup";
  if (strike.elapsed < strike.activeToMs) {
    /* The hitbox is live — the proximity check runs THIS frame. Out of
     * range here is a clean miss; in range connects once. */
    return "connect-check";
  }
  if (strike.elapsed < strike.endMs) {
    strike.resolved = true;
    return "recovery";
  }
  strike.resolved = true;
  return "done";
}

export function chugPhase(strike: ChugStrike): ChugPhase {
  if (strike.elapsed < strike.startupMs) return "startup";
  if (strike.elapsed < strike.activeToMs) return "active";
  if (strike.elapsed < strike.endMs) return "recovery";
  return "done";
}

/**
 * The state lockdown: a fighter mid-strike (startup, active, or recovery)
 * cannot move, attack again, or queue inputs. This is what kills attack
 * spam and input-queue desyncs.
 */
export function chugLocked(strike: ChugStrike | null | undefined): boolean {
  return Boolean(strike) && !strike!.resolved;
}

/* ------------------------------------------------------------------ distance */

/* The fight runs along the stage X axis; the 3D rigs mirror that position
 * on the floor plane (y = 0) in a shared depth lane (z = 0), so this
 * vector distance is the exact world-space gap the rendered models show.
 * Scratch vectors are reused — this runs every frame. */
const POS_A = new Vector3();
const POS_B = new Vector3();

/** Strict 3D proximity gate for the active hit frame. */
export function chugInRange(
  attackerX: number,
  defenderX: number,
  reach: number,
): boolean {
  const dist = POS_A.set(attackerX, 0, 0).distanceTo(POS_B.set(defenderX, 0, 0));
  return dist <= reach;
}

/* -------------------------------------------------------------------- brains */

export type ChugProfile = {
  /** The distance this character wants to fight at (stage %). Always
   * inside light reach, so the fighter physically walks to range. */
  engageRange: number;
  /** Walk speed (%/s). Deliberately slow — 3D fighters walk, they do
   * not teleport or skate across the stage. */
  speed: number;
  /** How eagerly it presses an attack (0..1). */
  aggression: number;
  /** How readily it raises its guard against an incoming strike (0..1). */
  guardBias: number;
  /** The strike kinds it leads with, most preferred first. */
  preferred: ChugAttackKind[];
  /** Cooldown after a strike of each kind (ms). */
  cooldowns: Record<ChugAttackKind, number>;
  /** The gap between two decisions (ms) — its fighting rhythm. */
  paceMs: number;
};

/**
 * The per-character fighting brain. Every fighter keeps its own range,
 * cadence and strike preferences — a heavy bruiser and a glass duelist
 * never behave the same way.
 */
export const CHUG_PROFILES: Record<FighterClass, ChugProfile> = {
  // Void Lord James — heavy close-range brawler. Fights inside your guard.
  void_lord_james: {
    engageRange: 11,
    speed: 8,
    aggression: 0.82,
    guardBias: 0.35,
    preferred: ["heavy", "light", "special"],
    cooldowns: { light: 230, heavy: 520, special: 880, critical: 1550 },
    paceMs: 260,
  },
  // Chog Princess — agile evasive striker. Holds the edge of her reach.
  chog_princess: {
    engageRange: 12,
    speed: 9,
    aggression: 0.55,
    guardBias: 0.75,
    preferred: ["light", "special", "heavy"],
    cooldowns: { light: 240, heavy: 640, special: 900, critical: 1700 },
    paceMs: 340,
  },
  // Crimson Lord Benja — fast and brutal, always in your face.
  crimson_lord_benja: {
    engageRange: 11,
    speed: 13,
    aggression: 0.88,
    guardBias: 0.4,
    preferred: ["light", "heavy", "special"],
    cooldowns: { light: 190, heavy: 500, special: 800, critical: 1450 },
    paceMs: 220,
  },
  // Chog Samurai — mid-range technician with a fast katana cadence.
  chog_samurai: {
    engageRange: 12,
    speed: 10,
    aggression: 0.76,
    guardBias: 0.55,
    preferred: ["light", "heavy", "special"],
    cooldowns: { light: 220, heavy: 560, special: 860, critical: 1550 },
    paceMs: 300,
  },
  // Lady Chog — elegant opportunist. Mixes her range well.
  lady_chog: {
    engageRange: 12,
    speed: 10,
    aggression: 0.66,
    guardBias: 0.6,
    preferred: ["light", "heavy", "special"],
    cooldowns: { light: 240, heavy: 580, special: 880, critical: 1600 },
    paceMs: 340,
  },
  // Warlord Chogzilla — enormous and slow. One long, heavy sequence.
  chogzila: {
    engageRange: 11,
    speed: 6,
    aggression: 0.52,
    guardBias: 0.25,
    preferred: ["heavy", "special", "light"],
    cooldowns: { light: 320, heavy: 700, special: 1050, critical: 1900 },
    paceMs: 480,
  },
};

export function chugProfileFor(cls: FighterClass): ChugProfile {
  return CHUG_PROFILES[cls] ?? CHUG_PROFILES.void_lord_james;
}

/* --------------------------------------------------------------------- arena */

export type ChugFighterConfig = {
  side: ChugSide;
  fighterClass: FighterClass;
  /** Stage track this fighter is clamped to: [minX, maxX] (stage %). */
  track: [number, number];
  /** True for the local player's fighter (affects damage tables). */
  isPlayer: boolean;
  /** Strike timings (startup/recover per kind, ms). */
  timings: ChugTimings;
  /** Signature + critical moves, for their damage ranges and names. */
  moves: { signatureMove: SpecialMove; criticalArt: SpecialMove };
  /** Starting hp (boss fighters get more). Defaults to 100. */
  hp?: number;
};

export type ChugFighterState = {
  side: ChugSide;
  fighterClass: FighterClass;
  x: number;
  hp: number;
  meter: number;
  isPlayer: boolean;
  /** ms of hurt lock left (flinch stun — cannot act while > 0). */
  hurtMs: number;
  /** True for the current strike's active/landing frame sequence. */
  strike: ChugStrike | null;
  /** The special/critical move the current strike carries, if any. */
  activeMove: SpecialMove | null;
  /** Facing direction (+1 right / -1 left); kept pointing at the foe. */
  facing: 1 | -1;
  /** ms since the fighter last moved — strikes need a planted stance. */
  stillMs: number;
  /** ms the guard is raised for (block stance). */
  blockMs: number;
  /** Walk direction this frame (-1/0/+1) — drives the walk animation. */
  moveDir: -1 | 0 | 1;
};

export type ChugBattleEvent =
  | { type: "swing"; side: ChugSide; kind: ChugAttackKind; moveName?: string }
  | {
      type: "connect";
      side: ChugSide;
      foeSide: ChugSide;
      kind: ChugAttackKind;
      move: SpecialMove | null;
      dmg: number;
      blocked: boolean;
      crit: boolean;
      /** Defender hp AFTER the damage was applied. */
      hpAfter: number;
    }
  | { type: "whiff"; side: ChugSide; kind: ChugAttackKind }
  | { type: "ko"; loser: ChugSide };

/**
 * The battle arena. Owns both fighters — positions, brains, strikes,
 * damage, meter, hurt locks and K.O. detection — and steps the whole
 * fight with one call. It never touches the DOM: every observable thing
 * comes back as an event, so the presentation layer decides what flashes,
 * shakes or sounds.
 */
export class ChugArena {
  readonly fighters: Record<ChugSide, ChugFighterState>;
  private readonly cfg: Record<ChugSide, ChugFighterConfig>;
  private readonly brains: Record<ChugSide, ChugBrain>;
  private readonly cooldowns: Record<ChugSide, number[]>;
  /** Damage multipliers (Second Wind / Overdrive style buffs). */
  private readonly buffs: Record<ChugSide, number> = {
    creator: 1,
    challenger: 1,
  };
  private koEmitted = false;

  constructor(creator: ChugFighterConfig, challenger: ChugFighterConfig) {
    this.cfg = { creator, challenger };
    this.buffs = { creator: 1, challenger: 1 };
    this.fighters = {
      creator: makeState(creator),
      challenger: makeState(challenger),
    };
    this.brains = {
      creator: new ChugBrain(chugProfileFor(creator.fighterClass)),
      challenger: new ChugBrain(chugProfileFor(challenger.fighterClass)),
    };
    this.cooldowns = {
      creator: [0, 0, 0, 0],
      challenger: [0, 0, 0, 0],
    };
  }

  /** Reset both fighters to their corners for a new round. */
  reset(): void {
    this.fighters.creator = makeState(this.cfg.creator);
    this.fighters.challenger = makeState(this.cfg.challenger);
    this.brains.creator.reset();
    this.brains.challenger.reset();
    this.cooldowns.creator.fill(0);
    this.cooldowns.challenger.fill(0);
    this.koEmitted = false;
  }

  setBuff(side: ChugSide, multiplier: number): void {
    this.buffs[side] = multiplier;
  }

  /**
   * Second Wind / Overdrive resurrection: restore a fighter's hp after
   * the K.O. event fired and re-arm the K.O. latch so the fight can end
   * for real when the pool empties again.
   */
  resurrect(side: ChugSide, hp: number): void {
    const f = this.fighters[side];
    f.hp = hp;
    f.strike = null;
    f.activeMove = null;
    f.hurtMs = 0;
    this.koEmitted = false;
  }

  /** The stage-% midpoint between the two fighters. */
  midpoint(): number {
    return (this.fighters.creator.x + this.fighters.challenger.x) / 2;
  }

  canAct(side: ChugSide): boolean {
    const f = this.fighters[side];
    return f.hurtMs <= 0 && !chugLocked(f.strike);
  }

  /**
   * Advance the whole battle by dt ms. Returns the events this frame
   * produced, in order — swing when a strike begins, connect only on a
   * verified active-frame proximity hit, whiff when the window closes on
   * empty air, ko the moment a hp pool empties.
   */
  step(dt: number): ChugBattleEvent[] {
    const events: ChugBattleEvent[] = [];
    const sides: ChugSide[] = ["creator", "challenger"];

    for (const side of sides) {
      const f = this.fighters[side];
      const foe = this.fighters[other(side)];
      f.hurtMs = Math.max(0, f.hurtMs - dt);
      f.stillMs += dt;
      f.blockMs = Math.max(0, f.blockMs - dt);
      /* fighters always square up to each other */
      f.facing = (Math.sign(foe.x - f.x) || 1) as 1 | -1;
      f.moveDir = 0;
      for (let i = 0; i < this.cooldowns[side].length; i++) {
        this.cooldowns[side][i] = Math.max(0, this.cooldowns[side][i] - dt);
      }
    }

    if (this.koEmitted) return events;

    /* 1. Brains decide movement, guard and strikes (respecting the
     * lockdown). */
    for (const side of sides) {
      const f = this.fighters[side];
      const foe = this.fighters[other(side)];
      const foeStrike = foe.strike;
      const decision = this.brains[side].update(dt, {
        selfX: f.x,
        foeX: foe.x,
        canAct: this.canAct(side),
        still: f.stillMs >= CHUG_SETTLE_MS,
        foeWindingUp: Boolean(
          foeStrike && chugPhase(foeStrike) === "startup",
        ),
      });
      if (decision.block) {
        f.blockMs = Math.max(f.blockMs, 420);
      }
      if (decision.move !== 0) {
        const dir = (Math.sign(foe.x - f.x) || 1) as 1 | -1;
        const [minX, maxX] = this.cfg[side].track;
        f.x = Math.min(
          maxX,
          Math.max(minX, f.x + dir * decision.move * this.brains[side].profile.speed * (dt / 1000)),
        );
        f.stillMs = 0;
        f.moveDir = dir;
      }
      if (decision.strike) this.beginStrike(side, decision.strike, events);
    }

    /* 2. Strikes advance: phases, lunge, active-frame validation. */
    for (const side of sides) {
      this.stepStrike(side, dt, events);
    }

    /* 3. Pushbox collision: the bodies are solid. Anything that squeezed
     * them inside the minimum gap this frame — walking, lunges, strike
     * drift — is pushed back apart along the ground plane before the
     * frame is presented. */
    this.resolvePushbox();

    /* 3. K.O. check. */
    for (const side of sides) {
      if (this.fighters[side].hp <= 0 && !this.koEmitted) {
        this.koEmitted = true;
        events.push({ type: "ko", loser: side });
      }
    }

    return events;
  }

  /**
   * Minimum-distance enforcement. If the gap between the two bodies drops
   * below CHUG_PUSHBOX, each is moved half the overlap away from the
   * other along the stage X axis (the ground plane), clamped to its walk
   * track. If one fighter is against its rail, the other absorbs the
   * whole correction so the separation always holds and the fighters can
   * never merge, phase through, or cross over — they stay face to face.
   */
  private resolvePushbox(): void {
    const a = this.fighters.creator;
    const b = this.fighters.challenger;
    const gap = Math.abs(b.x - a.x);
    if (gap >= CHUG_PUSHBOX) return;

    const dir: 1 | -1 = b.x >= a.x ? 1 : -1; // push b toward dir, a against
    const overlap = CHUG_PUSHBOX - gap;
    const [minA, maxA] = this.cfg.creator.track;
    const [minB, maxB] = this.cfg.challenger.track;

    const clampX = (x: number, [lo, hi]: [number, number]) =>
      Math.min(hi, Math.max(lo, x));

    let aX = clampX(a.x - (dir * overlap) / 2, this.cfg.creator.track);
    let bX = clampX(b.x + (dir * overlap) / 2, this.cfg.challenger.track);

    /* a hit its rail — b takes the remaining correction */
    if (Math.abs(aX - (a.x - (dir * overlap) / 2)) > 1e-6) {
      bX = clampX(b.x + dir * (overlap - Math.abs(aX - a.x)), this.cfg.challenger.track);
    } else if (Math.abs(bX - (b.x + (dir * overlap) / 2)) > 1e-6) {
      /* b hit its rail — a takes the rest */
      aX = clampX(a.x - dir * (overlap - Math.abs(bX - b.x)), this.cfg.creator.track);
    }

    /* never let the push cross the two bodies over each other */
    if ((bX - aX) * dir < 0) return;

    a.x = aX;
    b.x = bX;
  }

  private beginStrike(
    side: ChugSide,
    kind: ChugAttackKind,
    events: ChugBattleEvent[],
  ): void {
    const f = this.fighters[side];
    const foe = this.fighters[other(side)];
    /* Approach-first: no punching on the move, from outside range, or
     * while not squared up. Walk in, plant, THEN strike. */
    if (f.stillMs < CHUG_SETTLE_MS) return;
    const toFoe = Math.sign(foe.x - f.x) || 1;
    const dist = Math.abs(foe.x - f.x);
    if (dist > CHUG_REACH[kind]) return; // not in true striking range yet
    if (f.facing !== toFoe) return; // must be facing the defender
    const cost = kind === "special" ? 40 : kind === "critical" ? 100 : 0;
    if (f.meter < cost) return;
    f.meter = Math.max(0, f.meter - cost);
    f.strike = chugBeginStrike(kind, this.cfg[side].timings);
    f.activeMove =
      kind === "special"
        ? this.cfg[side].moves.signatureMove
        : kind === "critical"
          ? this.cfg[side].moves.criticalArt
          : null;
    /* The swing belongs to the ATTACK, not the hit — it sounds the moment
     * the strike starts, connect or whiff decided frames later. */
    events.push({ type: "swing", side, kind, moveName: f.activeMove?.name });
  }

  private stepStrike(
    side: ChugSide,
    dt: number,
    events: ChugBattleEvent[],
  ): void {
    const f = this.fighters[side];
    const strike = f.strike;
    if (!strike) return;
    const foe = this.fighters[other(side)];

    const ev = chugAdvance(strike, dt);

    if (ev === "startup") {
      /* a slow weight shift toward the foe while winding up */
      const dir = Math.sign(foe.x - f.x) || 1;
      const [minX, maxX] = this.cfg[side].track;
      f.x = Math.min(
        maxX,
        Math.max(minX, f.x + dir * CHUG_LUNGE_SPEED * (dt / 1000)),
      );
      return;
    }

    if (ev === "connect-check" && !strike.connected) {
      /* Second Wind / adrenaline shields eat the blow: the strike is spent
       * with no damage and no impact event. */
      if (this.invulnerable?.[foe.side]) {
        strike.connected = true; /* spent — never retried */
        strike.resolved = true;
        return;
      }
      if (chugInRange(f.x, foe.x, CHUG_REACH[strike.kind])) {
        strike.connected = true;
        strike.resolved = true;
        this.applyDamage(side, strike, events);
      }
      return; /* out of range during the active window = keep the window
                 open; it may connect on a later active frame */
    }

    if (ev === "recovery") {
      if (!strike.connected) events.push({ type: "whiff", side, kind: strike.kind });
      return;
    }

    if (ev === "done") {
      if (!strike.connected && strike.elapsed - dt < strike.activeToMs) {
        /* window closed on the very frame we advanced past it */
      }
      f.strike = null;
      f.activeMove = null;
    }
  }

  private applyDamage(
    side: ChugSide,
    strike: ChugStrike,
    events: ChugBattleEvent[],
  ): void {
    const attacker = this.fighters[side];
    const defender = this.fighters[other(side)];
    const crit = strike.kind === "critical" || strike.kind === "special";

    let dmg: number;
    if (attacker.isPlayer) {
      if (strike.kind === "light") dmg = randInt(8, 12);
      else if (strike.kind === "heavy") dmg = randInt(14, 19);
      else dmg = randInt(attacker.activeMove!.damage[0], attacker.activeMove!.damage[1]);
      dmg *= this.buffs[side];
    } else {
      if (strike.kind === "light") dmg = randInt(7, 11);
      else if (strike.kind === "heavy") dmg = randInt(12, 17);
      else dmg = randInt(attacker.activeMove!.damage[0], attacker.activeMove!.damage[1]) * 0.9;
      dmg *= this.buffs[side];
    }
    /* a raised guard turns a clean hit into a blocked impact */
    const blocked = this.fighters[other(side)].blockMs > 0;
    if (blocked) dmg *= 0.15;
    dmg = Math.max(1, Math.round(dmg));
    defender.hp = Math.max(0, defender.hp - dmg);

    /* Super meter: attacker builds on clean hits, defender on taking one */
    if (strike.kind === "light") attacker.meter = Math.min(100, attacker.meter + 10);
    else if (strike.kind === "heavy") attacker.meter = Math.min(100, attacker.meter + 14);
    defender.meter = Math.min(100, defender.meter + 6);
    if (blocked) defender.meter = Math.min(100, defender.meter + 10);

    /* interrupt the defender's strike — their hit frame is cancelled */
    if (defender.strike && !defender.strike.connected) {
      defender.strike.resolved = true;
      defender.strike = null;
      defender.activeMove = null;
    }

    /* hurt lock scales with the blow's weight */
    defender.hurtMs = strike.kind === "light" ? 220 : 340;

    events.push({
      type: "connect",
      side,
      foeSide: defender.side,
      kind: strike.kind,
      move: attacker.activeMove,
      dmg,
      blocked,
      crit,
      hpAfter: defender.hp,
    });
  }

  /** Presentation hook: guard state is input/UI-owned, chug just asks. */
  isBlocking(side: ChugSide): boolean {
    return this.blocking?.[side] ?? false;
  }

  blocking: Record<ChugSide, boolean> | null = null;

  /** Set by the presentation layer while a Second Wind shield is live —
   * chug eats strikes against that side with no damage and no events. */
  invulnerable: Record<ChugSide, boolean> | null = null;
}

function makeState(cfg: ChugFighterConfig): ChugFighterState {
  return {
    side: cfg.side,
    fighterClass: cfg.fighterClass,
    x: (cfg.track[0] + cfg.track[1]) / 2,
    hp: cfg.hp ?? 100,
    meter: 0,
    isPlayer: cfg.isPlayer,
    hurtMs: 0,
    strike: null,
    activeMove: null,
    facing: 1,
    stillMs: CHUG_SETTLE_MS,
    blockMs: 0,
    moveDir: 0,
  };
}

function other(side: ChugSide): ChugSide {
  return side === "creator" ? "challenger" : "creator";
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/* -------------------------------------------------------------------- brain */

export type ChugDecision = {
  /** Direction to step this frame: -1, 0, or 1 (sign is toward the foe). */
  move: -1 | 0 | 1;
  /** A strike to begin this frame, or null. */
  strike: ChugAttackKind | null;
  /** Raise / hold the guard this frame. */
  block: boolean;
};

/**
 * One brain per fighter. It reads distance and lock state and hands back
 * movement + strike decisions on its own cadence — the arena applies them.
 */
export class ChugBrain {
  readonly profile: ChugProfile;
  private nextDecisionMs = 0;
  private readonly cooldown = [0, 0, 0, 0];

  constructor(profile: ChugProfile) {
    this.profile = profile;
  }

  reset(): void {
    this.nextDecisionMs = 0;
    this.cooldown.fill(0);
  }

  update(
    dt: number,
    ctx: {
      selfX: number;
      foeX: number;
      /** False while chug holds the body in a strike or flinch. */
      canAct: boolean;
      /** True once the fighter has stood still long enough to plant. */
      still: boolean;
      /** True while the foe is winding a strike up. */
      foeWindingUp: boolean;
    },
  ): ChugDecision {
    this.nextDecisionMs -= dt;
    for (let i = 0; i < this.cooldown.length; i++) {
      this.cooldown[i] = Math.max(0, this.cooldown[i] - dt);
    }

    /* State lockdown: no movement, guard or strikes until the body is
     * free again. */
    if (!ctx.canAct) return { move: 0, strike: null, block: false };

    const dist = Math.abs(ctx.foeX - ctx.selfX);

    /* Reactive defense: a strike is coming in and we are close enough to
     * be the target — raise the guard on instinct. */
    if (
      ctx.foeWindingUp &&
      dist <= CHUG_REACH.heavy + 8 &&
      Math.random() < this.profile.guardBias
    ) {
      return { move: 0, strike: null, block: true };
    }

    /* Positioning first: out of range, WALK in — no punching on the
     * approach, no punching from halfway across the stage. */
    if (dist > this.profile.engageRange) {
      return { move: 1, strike: null, block: false };
    }

    /* In the pocket but still settling the stance — hold position. */
    if (!ctx.still) return { move: 0, strike: null, block: false };

    /* Planted and in range: strike on the character's rhythm, but only
     * with a blow whose reach actually covers the gap. */
    if (this.nextDecisionMs > 0) return { move: 0, strike: null, block: false };
    this.nextDecisionMs = this.profile.paceMs;

    if (Math.random() > this.profile.aggression) {
      return { move: 0, strike: null, block: false };
    }

    for (const kind of this.profile.preferred) {
      const idx = KIND_INDEX[kind];
      if (this.cooldown[idx] > 0) continue;
      if (dist > CHUG_REACH[kind]) continue; // keep walking in
      this.cooldown[idx] = this.profile.cooldowns[kind];
      return { move: 0, strike: kind, block: false };
    }
    return { move: 0, strike: null, block: false };
  }
}

const KIND_INDEX: Record<ChugAttackKind, number> = {
  light: 0,
  heavy: 1,
  special: 2,
  critical: 3,
};
