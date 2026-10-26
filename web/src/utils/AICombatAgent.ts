import type { FighterClass } from "@/config/fighterClasses";

/**
 * THE ARENA AI AGENT
 * ==================
 *
 * A dedicated, state-machine-driven opponent brain. Every decision is taken
 * from the CURRENT frame's state, so the agent reacts on the very next
 * animation frame (60 FPS) — no timers, no network round trip, no waiting
 * on the audio thread. The arena's single requestAnimationFrame loop drives
 * it, which is why it can never stutter or freeze the fight.
 *
 * Three tactical states:
 *
 *   approach  close the distance to the range this character fights at.
 *             The range is per fighter: a melee bruiser sits inside your
 *             guard, a duelist hangs at the edge of her light reach and
 *             waits for you to come to her.
 *
 *   combo     run a planned multi-hit sequence — a jab, a heavy, a
 *             signature — one strike at a time. Every step is checked
 *             against the REAL hitbox reach and the strike's own cooldown,
 *             so a strike is only ever thrown when it can actually land.
 *
 *   evade     break off and create space. Triggered the frame a heavy,
 *             special or critical starts winding up, and whenever the
 *             health gap turns against the agent.
 *
 * The brain is local and deterministic-per-frame: it never awaits anything.
 */

export type AgentAttackKind = "light" | "heavy" | "special" | "critical";

export type AgentState = "approach" | "combo" | "evade";

/** Centre-to-centre reach (stage %) for each strike. A strike thrown
 *  outside its reach whiffs, so the agent checks this before every hit. */
export const AGENT_REACH: Record<AgentAttackKind, number> = {
  light: 13,
  heavy: 14,
  special: 15,
  critical: 17,
};

/** Super meter each strike costs. */
export const AGENT_METER_COST: Record<AgentAttackKind, number> = {
  light: 0,
  heavy: 0,
  special: 40,
  critical: 100,
};

const ALL_KINDS: AgentAttackKind[] = ["light", "heavy", "special", "critical"];

export type AgentProfile = {
  /** The distance this character wants to fight at (stage %). */
  engageRange: number;
  /** Movement speed (%/s). */
  speed: number;
  /** How eagerly it presses an attack (0..1). */
  aggression: number;
  /** How readily it gives ground when a heavy comes in (0..1). */
  evadeBias: number;
  /** The strike kinds it leads with, most preferred first. */
  preferred: AgentAttackKind[];
  /** The combo routes it can run, most preferred first. */
  routes: AgentAttackKind[][];
  /** Cooldown after a strike of each kind (ms). */
  cooldowns: Record<AgentAttackKind, number>;
  /** The gap between two combos (ms) — its fighting rhythm. */
  paceMs: number;
};

/**
 * The per-character brain.
 *
 * Every fighter fights at its own range, with its own routes and its own
 * rhythm — a heavy bruiser and a glass duelist never behave the same way.
 */
export const AGENT_PROFILES: Record<FighterClass, AgentProfile> = {
  // Void Lord James — a HEAVY close-range brawler. He fights inside your
  // guard, leads with the slam and does not run from a heavy: he takes it
  // and answers harder. Relentless rhythm, slow to give ground.
  void_lord_james: {
    engageRange: 23,
    speed: 18,
    aggression: 0.82,
    evadeBias: 0.3,
    preferred: ["heavy", "light", "special"],
    routes: [
      ["heavy", "light", "heavy"],
      ["light", "heavy", "light"],
      ["heavy", "special"],
    ],
    cooldowns: { light: 230, heavy: 520, special: 880, critical: 1550 },
    paceMs: 260,
  },
  // Chog Princess — an AGILE evasive striker. She holds the edge of her
  // light reach, leads with the jab and slips out of a heavy rather than
  // trading through it. Quick feet, longer resets.
  chog_princess: {
    engageRange: 28,
    speed: 20,
    aggression: 0.55,
    evadeBias: 0.9,
    preferred: ["light", "special", "heavy"],
    routes: [
      ["light", "special", "light"],
      ["light", "heavy", "special"],
      ["special", "light"],
    ],
    cooldowns: { light: 240, heavy: 640, special: 900, critical: 1700 },
    paceMs: 340,
  },
  // Crimson Lord Benja — fast and brutal. He is always in your face and
  // chains the shortest strikes together.
  crimson_lord_benja: {
    engageRange: 23,
    speed: 34,
    aggression: 0.88,
    evadeBias: 0.55,
    preferred: ["light", "heavy", "special"],
    routes: [
      ["light", "light", "heavy"],
      ["light", "heavy", "special"],
      ["light", "light", "light"],
    ],
    cooldowns: { light: 190, heavy: 500, special: 800, critical: 1450 },
    paceMs: 220,
  },
  // Chog Samurai — a mid-range technician with a fast katana cadence.
  chog_samurai: {
    engageRange: 25,
    speed: 24,
    aggression: 0.76,
    evadeBias: 0.6,
    preferred: ["light", "heavy", "special"],
    routes: [
      ["light", "heavy", "special"],
      ["light", "light", "heavy"],
      ["heavy", "critical"],
    ],
    cooldowns: { light: 220, heavy: 560, special: 860, critical: 1550 },
    paceMs: 300,
  },
  // Lady Chog — an elegant opportunist. She mixes her range well.
  lady_chog: {
    engageRange: 26,
    speed: 26,
    aggression: 0.66,
    evadeBias: 0.7,
    preferred: ["light", "heavy", "special"],
    routes: [
      ["light", "heavy"],
      ["heavy", "special"],
      ["light", "light", "heavy"],
    ],
    cooldowns: { light: 240, heavy: 580, special: 880, critical: 1600 },
    paceMs: 340,
  },
  // Warlord Chogzilla — enormous and slow. Once he is on top of you the
  // whole thing is one long, heavy sequence.
  chogzila: {
    engageRange: 23,
    speed: 14,
    aggression: 0.52,
    evadeBias: 0.25,
    preferred: ["heavy", "special", "light"],
    routes: [
      ["heavy", "special"],
      ["heavy"],
      ["light", "heavy"],
    ],
    cooldowns: { light: 340, heavy: 700, special: 1050, critical: 1900 },
    paceMs: 480,
  },
};

/** The brain for a fighter class. */
export function agentProfileFor(cls: FighterClass): AgentProfile {
  return AGENT_PROFILES[cls] ?? AGENT_PROFILES.void_lord_james;
}

/**
 * The slice of a fighter the agent needs to see.
 *
 * Structurally compatible with the arena's fighter runtime state, so the
 * agent can read the fight and write its movement back without the arena
 * and the brain knowing about each other.
 */
export type AgentFighterView = {
  x: number;
  hp: number;
  meter: number;
  facing: "left" | "right";
  down: boolean;
  stunMs: number;
  blockHeld: boolean;
  /** -1 backing off, 0 still, 1 closing in */
  moveDir: number;
  toward: boolean;
  leanDir: "forward" | "retreat" | null;
  /** The strike in flight, if any. */
  attack: { kind: AgentAttackKind; windup: number; recover: number } | null;
};

export type AgentContext = {
  /** The fighter this brain drives. */
  self: AgentFighterView;
  /** The fighter it is fighting. */
  foe: AgentFighterView;
  /** A unique id for this fighter instance — the brain's own identity. */
  selfId: string;
  /** A unique id for the opponent — what this brain is locked onto. */
  foeId: string;
  /** This fighter's own profile, read from the LOADED fighter config. */
  profile: AgentProfile;
  /** The opponent's profile — the standoff is the middle of the two
   *  fighting ranges, so both brains agree on where to stand and the
   *  pair never oscillates. */
  foeProfile: AgentProfile;
  /** The track the fighter is confined to (stage %). */
  track: readonly [number, number];
  /** The opponent's track — together they define the closest two fighters
   * can ever stand, which is what the standoff is measured against. */
  foeTrack: readonly [number, number];
  /** Fire a strike at the locked-on opponent. The arena refuses anything
   *  aimed at the wrong target. */
  strike: (kind: AgentAttackKind, targetId: string) => void;
};

/** How long the agent keeps a route alive while it cannot reach. */
const ROUTE_PATIENCE_MS = 700;

/** The health gap that flips the agent into a defensive posture. */
const LOSING_HP_GAP = 16;

/** How long after an evade the agent refuses to break off again (ms). */
const EVADE_LOCKOUT_MS = 180;

/**
 * The agent.
 *
 * One instance per fighter. It is stepped once per animation frame from
 * the arena's game loop and holds all of its own state, so a round can be
 * reset with a single `reset()`.
 */
export class AICombatAgent {
  /** The tactical state the agent is in right now. */
  state: AgentState = "approach";
  /** Why the agent is doing what it is doing this frame (debug/HUD). */
  reason = "idle";
  /** The unique id of the opponent this brain is locked onto. */
  targetId = "";
  /** ms spent in the current state. */
  stateMs = 0;
  /** The strike sequence being executed. */
  route: AgentAttackKind[] = [];
  /** The index of the next strike in the sequence. */
  private step = 0;
  /** How long the agent holds the evade state (ms). */
  private evadeMs = 0;
  /** A short lockout after an evade, so the agent cannot bounce in and
   *  out of the state while the same threat is still on screen. */
  private evadeLockMs = 0;
  /** ms until the agent is willing to start another combo. */
  private paceMs = 0;
  /** How long the current route has been waiting for its range (ms). */
  private routeWaitMs = 0;
  /** Remaining cooldown per strike kind (ms). */
  private cooldown: Record<AgentAttackKind, number>;

  constructor(readonly profile: AgentProfile) {
    this.cooldown = { light: 0, heavy: 0, special: 0, critical: 0 };
  }

  /** A clean brain — a new round starts from scratch. */
  reset(): void {
    this.state = "approach";
    this.stateMs = 0;
    this.route = [];
    this.evadeMs = 0;
    this.paceMs = 0;
    this.routeWaitMs = 0;
    this.cooldown = { light: 0, heavy: 0, special: 0, critical: 0 };
  }

  /**
   * One frame of thinking.
   *
   * Called from the arena's requestAnimationFrame loop — this is the whole
   * latency budget: whatever the agent decides, it does on this frame.
   */
  update(dt: number, ctx: AgentContext): void {
    const { self, foe } = ctx;
    this.stateMs += dt;
    /* The brain is locked onto ONE opponent id — the hitbox it tracks
     * always belongs to that exact fighter. */
    this.targetId = ctx.foeId;

    if (this.paceMs > 0) this.paceMs = Math.max(0, this.paceMs - dt);
    if (this.evadeLockMs > 0) this.evadeLockMs = Math.max(0, this.evadeLockMs - dt);
    for (const kind of ALL_KINDS) {
      if (this.cooldown[kind] > 0) {
        this.cooldown[kind] = Math.max(0, this.cooldown[kind] - dt);
      }
    }

    /* Down or stunned: the agent has no say in what happens next. */
    if (self.down || self.stunMs > 0) {
      this.reset();
      this.hold(self);
      return;
    }

    /* Always square up. */
    self.facing = foe.x >= self.x ? "right" : "left";

    const dist = Math.abs(foe.x - self.x);
    const toFoe = Math.sign(foe.x - self.x) || (self.facing === "left" ? -1 : 1);

    /* ---- perception, every single frame ---- */
    const incoming = detectIncoming(foe);
    const losing = foe.hp - self.hp > LOSING_HP_GAP;

    /* A strike in flight plays itself out — no steering mid-swing. */
    if (self.attack) {
      this.hold(self);
      return;
    }

    switch (this.state) {
      case "evade":
        this.runEvade(dt, ctx, dist, toFoe, incoming);
        return;
      case "combo":
        this.runCombo(dt, ctx, dist, toFoe, incoming);
        return;
      default:
        this.runApproach(dt, ctx, dist, toFoe, incoming, losing);
    }
  }

  /* ------------------------------------------------------------- approach */

  /**
   * Close the distance to this character's fighting range, then look for an
   * opening to start a combo.
   */
  private runApproach(
    dt: number,
    ctx: AgentContext,
    dist: number,
    toFoe: number,
    incoming: AgentAttackKind | null,
    losing: boolean,
  ): void {
    const { self, foe, profile, foeProfile } = ctx;

    /* A heavy is coming in — break off THIS frame, not on the next
     * decision tick. This is the whole point of a per-frame brain. */
    if (incoming && this.evadeLockMs <= 0) {
      this.enterEvade(ctx, incoming === "critical" ? 620 : 460);
      return;
    }

    /* The standoff both brains agree on: the middle of the two fighting
     * ranges, so the pair settles instead of shuffling back and forth.
     *
     * It is clamped to the gap the stage actually allows — the two tracks
     * keep the fighters on opposite sides of the CWO lettering, so there
     * is a hard floor they can never close past. Without the clamp the
     * pair would walk into the floor forever and never trade a blow.
     *
     * Losing the health war makes the agent GIVE GROUND: it holds a longer
     * range instead of trading at close quarters. It still fights — a
     * permanent retreat would just be a stalemate. */
    const standoff = standoffFor(ctx) + (losing ? 4 : 0);

    /* Never let the bodies overlap. */
    if (dist < standoff - 6) {
      this.reason = "overlap";
      this.stepAway(self, foe, profile.speed * 0.7, dt, ctx.track);
      self.blockHeld = false;
      return;
    }

    /* Out of range — close in. */
    if (dist > standoff) {
      this.reason = "closing";
      this.stepToward(self, foe, profile.speed, dt, ctx.track);
      self.blockHeld = false;
      return;
    }

    /* In range and idle. */
    this.hold(self);
    self.blockHeld = false;

    /* Still counting down from the last combo — hold the guard. */
    if (this.paceMs > 0) {
      this.reason = "paced";
      self.blockHeld = true;
      return;
    }

    const route = this.planRoute(ctx);
    if (!route.length) {
      /* Everything is on cooldown — guard up and wait for it. */
      this.reason = "no-route";
      self.blockHeld = true;
      this.paceMs = 120;
      return;
    }

    this.route = route;
    /* The step index belongs to the route it was counting through — a new
     * sequence starts from the top. */
    this.step = 0;
    this.routeWaitMs = 0;
    this.setState("combo");
    this.runCombo(dt, ctx, dist, toFoe, incoming);
  }

  /* --------------------------------------------------------------- combo */

  /**
   * Run the planned sequence, one strike at a time.
   *
   * Each step waits for the previous strike to land, checks that the
   * strike's OWN reach actually covers the distance, and respects the
   * strike's cooldown. If the opponent backs out of range the agent
   * closes the gap; if it cannot, it abandons the route rather than
   * swinging at air.
   */
  private runCombo(
    dt: number,
    ctx: AgentContext,
    dist: number,
    toFoe: number,
    incoming: AgentAttackKind | null,
  ): void {
    const { self, foe, profile } = ctx;

    /* A heavy coming in mid-combo: brace for it, but KEEP the route — the
     * sequence resumes the moment the threat passes. */
    if (incoming && this.evadeLockMs <= 0) {
      this.enterEvade(ctx, incoming === "critical" ? 620 : 460);
      return;
    }

    /* The route is finished. */
    if (this.step >= this.route.length) {
      this.route = [];
      this.paceMs = profile.paceMs;
      this.setState("approach");
      return;
    }

    const kind = this.route[this.step];

    /* Not off cooldown yet — hold the distance and wait. */
    if (this.cooldown[kind] > 0) {
      this.reason = "cooldown";
      this.hold(self);
      this.routeWaitMs = 0;
      return;
    }

    /* Not enough meter for a special or a critical. */
    if (self.meter < AGENT_METER_COST[kind]) {
      this.step += 1;
      return;
    }

    /* OUT OF HITBOX RANGE — this is the accurate-range check. The strike
     * would whiff, so close the gap first. */
    if (dist > AGENT_REACH[kind]) {
      this.reason = "out-of-reach";
      this.routeWaitMs += dt;
      this.stepToward(self, foe, profile.speed, dt, ctx.track);
      if (this.routeWaitMs > ROUTE_PATIENCE_MS) {
        /* it cannot get there — abandon the route */
        this.route = [];
        this.paceMs = profile.paceMs;
        this.setState("approach");
      }
      return;
    }

    /* Fire it. The arena has the last word on whether it is allowed, and
     * the target id travels with it so the strike can only ever land on
     * the fighter this brain is locked onto. */
    this.reason = "fired";
    ctx.strike(kind, ctx.foeId);
    this.cooldown[kind] = profile.cooldowns[kind];
    this.step += 1;
    this.routeWaitMs = 0;
  }

  /**
   * Choose the combo to run.
   *
   * The preferred route wins if it is playable; otherwise the agent falls
   * back to a shorter sequence it can actually afford right now.
   */
  private planRoute(ctx: AgentContext): AgentAttackKind[] {
    const { self, profile } = ctx;
    for (const route of profile.routes) {
      const usable = route.filter(
        (kind) =>
          self.meter >= AGENT_METER_COST[kind] && this.cooldown[kind] <= 0,
      );
      if (!usable.length) continue;
      /* The fighter's own preference orders the sequence: a brawler leads
       * with the slam, a skirmisher leads with the jab. */
      return usable.sort(
        (a, b) => profile.preferred.indexOf(a) - profile.preferred.indexOf(b),
      );
    }
    return [];
  }

  /* --------------------------------------------------------------- evade */

  /**
   * Break off and create space.
   *
   * The agent backs away from the incoming attack and raises the guard
   * against it — a heavy is worth blocking, a light is not worth the
   * recovery frames.
   */
  private runEvade(
    dt: number,
    ctx: AgentContext,
    dist: number,
    toFoe: number,
    incoming: AgentAttackKind | null,
  ): void {
    const { self, foe, profile } = ctx;
    /* The threat is gone and the hold is over — back to work. */
    if (!incoming && this.stateMs >= this.evadeMs) {
      if (this.step < this.route.length) {
        /* the sequence was interrupted — pick it back up where it stopped */
        this.setState("combo");
      } else {
        this.setState("approach");
        this.paceMs = 90;
      }
      return;
    }

    /* Keep the distance — but never so much that the agent cannot fight
     * back. Backing out of LIGHT reach would turn every exchange into a
     * stalemate, so the retreat is capped a little past the standoff. */
    const limit = standoffFor(ctx) + 3;
    if (dist < limit) {
      this.stepAway(self, foe, profile.speed * 0.8, dt, ctx.track);
    } else {
      this.hold(self);
    }

    /* Guard only against the hits worth guarding. */
    self.blockHeld = incoming !== null && incoming !== "light";
  }

  private enterEvade(ctx: AgentContext, durationMs: number): void {
    /* How readily this character gives ground: a brawler barely moves,
     * a skirmisher slips all the way out. */
    const bias = ctx.profile.evadeBias;
    this.setState("evade");
    this.evadeMs = Math.round(durationMs * (0.5 + bias * 0.7));
    /* A short lockout after the evade, so the agent cannot bounce in and
     * out of the state while the threat is still on screen. */
    this.evadeLockMs = EVADE_LOCKOUT_MS;
    ctx.self.blockHeld = true;
  }

  /* ------------------------------------------------------------ movement */

  /** Walk toward the opponent. */
  private stepToward(
    self: AgentFighterView,
    foe: AgentFighterView,
    speed: number,
    dt: number,
    track: readonly [number, number],
  ): void {
    const dir = Math.sign(foe.x - self.x) || (self.facing === "left" ? -1 : 1);
    self.moveDir = dir;
    self.toward = true;
    self.leanDir = "forward";
    self.x = clampToTrack(self.x + dir * speed * (dt / 1000), track);
  }

  /** Walk away from the opponent. */
  private stepAway(
    self: AgentFighterView,
    foe: AgentFighterView,
    speed: number,
    dt: number,
    track: readonly [number, number],
  ): void {
    const dir = Math.sign(self.x - foe.x) || (self.facing === "left" ? 1 : -1);
    self.moveDir = dir;
    self.toward = false;
    self.leanDir = "retreat";
    self.x = clampToTrack(self.x + dir * speed * (dt / 1000), track);
  }

  /** Stand still and hold the current intent. */
  private hold(self: AgentFighterView): void {
    self.moveDir = 0;
    self.toward = false;
    self.leanDir = null;
  }

  private setState(next: AgentState): void {
    if (this.state === next) return;
    this.state = next;
    this.stateMs = 0;
  }
}

/**
 * The distance both fighters settle at.
 *
 * The middle of their two fighting ranges, clamped to the gap the stage
 * physically allows. Both brains compute the same number, so the pair
 * converges instead of shuffling back and forth.
 */
function standoffFor(ctx: AgentContext): number {
  const { profile, foeProfile } = ctx;
  return Math.max(
    reachableGap(ctx),
    (profile.engageRange + foeProfile.engageRange) / 2,
  );
}

/**
 * The closest the two fighters can ever stand.
 *
 * Each fighter is confined to its own track, one on either side of the
 * CWO lettering, so the gap between them has a hard floor.
 */
function reachableGap(ctx: AgentContext): number {
  const { self, foe, track, foeTrack } = ctx;
  const gap = self.x <= foe.x ? foeTrack[0] - track[1] : track[0] - foeTrack[1];
  return Math.max(0, gap);
}

/**
 * The strike that is coming at the agent, if any.
 *
 * A light is too fast to be worth breaking for — everything else gets a
 * reaction on the frame its windup starts.
 */
function detectIncoming(foe: AgentFighterView): AgentAttackKind | null {
  const a = foe.attack;
  if (!a || a.windup <= 0) return null;
  if (a.kind === "light") return null;
  return a.kind;
}

function clampToTrack(x: number, track: readonly [number, number]): number {
  return Math.min(track[1], Math.max(track[0], x));
}
