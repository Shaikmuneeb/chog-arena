"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, SkipForward } from "lucide-react";
import { FighterAvatarBadge } from "@/context/FighterProfileContext";
import type { FighterClass } from "@/config/fighterClasses";
import { FIGHTER_CLASS_META } from "@/config/fighterClasses";
import type { SpriteState } from "./FighterSprite";
import { SheetFighter } from "./ChogzillaSprite";
import { cn, formatMon, truncateAddress } from "@/lib/utils";

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
export type FighterDescriptor = {
  address: `0x${string}`;
  name: string;
  title?: string;
  fighterClass: FighterClass;
};

type Side = "creator" | "challenger";

type Strike = {
  attacker: Side;
  /** Damage dealt; ignored when suddenDeath (uses defender's remaining HP). */
  damage: number;
  crit: boolean;
  suddenDeath?: boolean;
};

type CombatScript = {
  strikes: Strike[];
  suddenDeath: Strike | null;
  revivedSide: Side | null;
  loserSide: Side;
  finalWinnerSide: Side;
};

type Stage =
  | "faceoff"
  | "combat"
  | "down"
  | "secondwind"
  | "suddendeath"
  | "verdict";

type Fx = {
  id: number;
  attacker: Side;
  target: Side;
  dmg: number;
  crit: boolean;
  suddenDeath?: boolean;
};

type BattleArenaModalProps = {
  outcome: DuelOutcome | null;
  creatorFighter: FighterDescriptor;
  challengerFighter: FighterDescriptor;
  explorerTxUrl?: string;
  onClose: () => void;
};

/**
 * Street-Fighter-style battle stage: arcade HUD (PFPs, slanted HP bars,
 * timer/pot), a colosseum stage with two full-body FighterSprite rigs that
 * dash, swing, take damage, die, and resurrect — driven by the real duel
 * outcome.
 */
export function BattleArenaModal({
  outcome,
  creatorFighter,
  challengerFighter,
  explorerTxUrl,
  onClose,
}: BattleArenaModalProps) {
  const [stage, setStage] = useState<Stage>("faceoff");
  const [hp, setHp] = useState<{ creator: number; challenger: number }>({
    creator: 100,
    challenger: 100,
  });
  const [strikeIdx, setStrikeIdx] = useState(0);
  const [fx, setFx] = useState<Fx | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [timer, setTimer] = useState(99);
  const hpRef = useRef({ creator: 100, challenger: 100 });
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const nameOf = (side: Side): string =>
    side === "creator" ? creatorFighter.name : challengerFighter.name;

  /* Pre-calculate the full combat script from the settled outcome. */
  const script = useMemo<CombatScript | null>(() => {
    if (!outcome) return null;
    const creatorWon =
      outcome.winnerAddress.toLowerCase() ===
      creatorFighter.address.toLowerCase();
    const finalWinnerSide: Side = creatorWon ? "creator" : "challenger";
    const loserSide: Side = creatorWon ? "challenger" : "creator";

    // Winner lands 3 blows summing to exactly 100; loser lands 2 counters.
    const a = 20 + Math.floor(Math.random() * 10); // 20–29
    const b = 30 + Math.floor(Math.random() * 8); // 30–37
    const c = 100 - a - b; // 34–50
    const e = 12 + Math.floor(Math.random() * 10); // 12–21
    const f = 18 + Math.floor(Math.random() * 12); // 18–29

    const strikes: Strike[] = [
      { attacker: finalWinnerSide, damage: a, crit: false },
      { attacker: loserSide, damage: e, crit: false },
      { attacker: finalWinnerSide, damage: b, crit: true },
      { attacker: loserSide, damage: f, crit: false },
      { attacker: finalWinnerSide, damage: c, crit: true }, // final blow → 0 HP
    ];

    let suddenDeath: Strike | null = null;
    let revivedSide: Side | null = null;
    if (outcome.secondWind) {
      revivedSide = loserSide;
      const revivedWins =
        outcome.resurrectedAddress != null &&
        outcome.winnerAddress.toLowerCase() ===
          outcome.resurrectedAddress.toLowerCase();
      const finisher: Side = revivedWins ? loserSide : finalWinnerSide;
      suddenDeath = {
        attacker: finisher,
        damage: 0,
        crit: true,
        suddenDeath: true,
      };
    }

    return { strikes, suddenDeath, revivedSide, loserSide, finalWinnerSide };
  }, [outcome, creatorFighter.address]);

  /* Reset all combat state whenever a new outcome arrives. */
  useEffect(() => {
    if (!outcome || !script) return;
    hpRef.current = { creator: 100, challenger: 100 };
    setHp(hpRef.current);
    setStage("faceoff");
    setStrikeIdx(0);
    setFx(null);
    setTimer(99);
    setLogLines([
      `⚔️ Duel #${outcome.duelId} — ${nameOf("creator")} vs ${nameOf("challenger")}!`,
      `💰 Prize pot: ${formatMon(outcome.pot)} MON on the line!`,
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome, script]);

  /* Arcade timer ticks during the fight. */
  useEffect(() => {
    if (stage === "faceoff" || stage === "verdict") return;
    const interval = setInterval(() => {
      setTimer((t) => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [stage]);

  /* Stage 1 → 2: face-off holds 1.5s, then the clashes begin. */
  useEffect(() => {
    if (stage !== "faceoff") return;
    const timeout = setTimeout(() => setStage("combat"), 1500);
    return () => clearTimeout(timeout);
  }, [stage]);

  /* Stage 2: strike exchange every 700ms (first strike slightly faster). */
  useEffect(() => {
    if (stage !== "combat" || !script || !outcome) return;
    if (strikeIdx >= script.strikes.length) {
      const timeout = setTimeout(
        () => setStage(outcome.secondWind ? "down" : "verdict"),
        650,
      );
      return () => clearTimeout(timeout);
    }
    const strike = script.strikes[strikeIdx];
    const timeout = setTimeout(
      () => {
        executeStrike(strike);
        setStrikeIdx((i) => i + 1);
      },
      strikeIdx === 0 ? 450 : 700,
    );
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, strikeIdx, script, outcome]);

  /* Defeated pause: 0.5s of silence at 0 HP before the resurrection flash. */
  useEffect(() => {
    if (stage !== "down") return;
    const timeout = setTimeout(() => setStage("secondwind"), 500);
    return () => clearTimeout(timeout);
  }, [stage]);

  /* Stage 3: Second Wind flash + HP refill to 50%, then sudden death. */
  useEffect(() => {
    if (stage !== "secondwind" || !script) return;
    const refill = setTimeout(() => {
      if (!script.revivedSide) return;
      const revived = script.revivedSide;
      hpRef.current = { ...hpRef.current, [revived]: 50 };
      setHp(hpRef.current);
      setLogLines((l) => [
        ...l,
        `🛡️ SECOND WIND! ${nameOf(revived)} resurrects with 50 HP!`,
      ]);
    }, 900);
    const next = setTimeout(() => setStage("suddendeath"), 2500);
    return () => {
      clearTimeout(refill);
      clearTimeout(next);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, script]);

  /* Sudden-death clash decides the true winner. */
  useEffect(() => {
    if (stage !== "suddendeath" || !script?.suddenDeath) return;
    const timeout = setTimeout(() => {
      executeStrike(script.suddenDeath!);
      setTimeout(() => setStage("verdict"), 950);
    }, 650);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, script]);

  /* Clear the floating hit FX after its animation plays out. */
  useEffect(() => {
    if (!fx) return;
    const timeout = setTimeout(() => setFx(null), 950);
    return () => clearTimeout(timeout);
  }, [fx]);

  /* Keep the combat log pinned to the latest line. */
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [logLines]);

  function executeStrike(strike: Strike) {
    const defender: Side =
      strike.attacker === "creator" ? "challenger" : "creator";
    const applied = Math.min(
      strike.suddenDeath ? hpRef.current[defender] : strike.damage,
      hpRef.current[defender],
    );
    hpRef.current = {
      ...hpRef.current,
      [defender]: Math.max(0, hpRef.current[defender] - applied),
    };
    setHp(hpRef.current);
    setFx({
      id: Date.now(),
      attacker: strike.attacker,
      target: defender,
      dmg: applied,
      crit: strike.crit,
      suddenDeath: strike.suddenDeath,
    });

    const attackerName = nameOf(strike.attacker);
    let line: string;
    if (strike.suddenDeath) {
      line = `☠️ SUDDEN DEATH — ${attackerName} lands the finishing blow for ${applied} DMG!`;
    } else if (strike.crit) {
      line = `💥 ${attackerName} CRITS for ${applied} DMG!`;
    } else if (Math.random() < 0.5) {
      line = `⚡ ${attackerName} lands a heavy Monad strike for ${applied} DMG!`;
    } else {
      line = `⚡ ${attackerName} strikes for ${applied} DMG!`;
    }
    setLogLines((l) => [...l, line]);
  }

  function skipToVerdict() {
    setStage("verdict");
  }

  /* Sprite state machine per side. */
  function sideState(side: Side): SpriteState {
    if (stage === "faceoff") return "idle";
    if (stage === "verdict") {
      return side === script!.finalWinnerSide ? "victory" : "dead";
    }
    if (stage === "down") {
      return side === script!.loserSide ? "dead" : "idle";
    }
    if (stage === "secondwind") {
      return side === script!.revivedSide ? "secondWind" : "idle";
    }
    // combat / suddendeath — driven by the current strike FX
    if (!fx) return "idle";
    if (fx.attacker === side) return "attack";
    if (fx.target === side) return "hit";
    return "idle";
  }

  if (!outcome || !script) return null;

  const fighting = stage !== "verdict";
  const lastStrike =
    script.suddenDeath ?? script.strikes[script.strikes.length - 1];
  const finalBlowLog = lastStrike.suddenDeath
    ? `☠️ SUDDEN DEATH — ${nameOf(lastStrike.attacker)} landed the finishing blow`
    : lastStrike.crit
      ? `💥 ${nameOf(lastStrike.attacker)} landed a CRIT final blow`
      : `⚡ ${nameOf(lastStrike.attacker)} landed the final blow`;
  const revivedName = script.revivedSide ? nameOf(script.revivedSide) : null;
  const spriteAnimKey = `${stage}-${fx?.id ?? 0}`;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/90 p-3 backdrop-blur-sm sm:p-4">
      <div
        className="relative flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-red-500/30 bg-zinc-950 shadow-[0_0_70px_-10px_rgba(239,68,68,0.3)]"
        role="dialog"
        aria-modal="true"
      >
        {/* Skip control (pre-verdict only) */}
        {fighting && (
          <button
            type="button"
            onClick={skipToVerdict}
            className="absolute right-3 top-3 z-30 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/60 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 transition hover:border-white/30 hover:text-zinc-200"
          >
            <SkipForward className="h-3 w-3" aria-hidden />
            Skip
          </button>
        )}

        {/* ================= STAGE 4: FINAL VERDICT ================= */}
        {stage === "verdict" ? (
          <VerdictScreen
            outcome={outcome}
            creatorName={creatorFighter.name}
            challengerName={challengerFighter.name}
            creatorFighter={creatorFighter}
            challengerFighter={challengerFighter}
            revivedName={revivedName}
            finalBlowLog={finalBlowLog}
            explorerTxUrl={explorerTxUrl}
            onClose={onClose}
          />
        ) : (
          <>
            {/* ============ ARCADE HUD ============ */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-white/10 bg-black/70 px-3 pb-3 pt-4 sm:gap-4 sm:px-6">
              <HudSide
                fighter={creatorFighter}
                hp={hp.creator}
                align="left"
              />
              <div className="flex flex-col items-center gap-0.5 px-1">
                <p className="font-mono text-2xl font-black tabular-nums text-amber-300 drop-shadow-[0_0_10px_rgba(251,191,36,0.6)]">
                  {String(timer).padStart(2, "0")}
                </p>
                <p className="whitespace-nowrap bg-gradient-to-r from-amber-300 to-orange-300 bg-clip-text text-xs font-extrabold text-transparent">
                  {formatMon(outcome.pot)} MON
                </p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">
                  Duel #{outcome.duelId}
                </p>
              </div>
              <HudSide
                fighter={challengerFighter}
                hp={hp.challenger}
                align="right"
              />
            </div>

            {/* ============ 2D BATTLE STAGE ============ */}
            <div className="relative h-[320px] overflow-hidden sm:h-[360px]">
              {/* Arena background art */}
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{
                  backgroundImage: "url(/assets/arena-background.jpg)",
                }}
                aria-hidden
              />
              {/* Dark overlay — keeps HUD text, HP bars, and runes crisp */}
              <div
                className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/70"
                aria-hidden
              />
              {/* Arena floor with glowing Monad runes */}
              <div className="absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-b from-transparent via-[#241a3d]/60 to-[#120d22]/90">
                <svg
                  className="absolute inset-0 h-full w-full"
                  viewBox="0 0 800 160"
                  preserveAspectRatio="none"
                  aria-hidden
                >
                  {/* Floor perspective lines */}
                  {Array.from({ length: 9 }).map((_, i) => (
                    <line
                      key={i}
                      x1={i * 100}
                      y1="0"
                      x2={400 + (i * 100 - 400) * 1.6}
                      y2="160"
                      stroke="#7c3aed"
                      strokeWidth="0.8"
                      opacity="0.25"
                    />
                  ))}
                  <line
                    x1="0"
                    y1="2"
                    x2="800"
                    y2="2"
                    stroke="#a855f7"
                    strokeWidth="2"
                    opacity="0.5"
                  />
                </svg>
                {/* Glowing purple runes */}
                {[
                  { left: "18%", top: "30%", glyph: "ᛝ" },
                  { left: "48%", top: "55%", glyph: "ᛟ" },
                  { left: "76%", top: "25%", glyph: "ᛉ" },
                ].map((rune) => (
                  <span
                    key={rune.glyph}
                    className="animate-pulse absolute select-none text-2xl text-purple-400/60 drop-shadow-[0_0_10px_rgba(168,85,247,0.8)]"
                    style={{ left: rune.left, top: rune.top }}
                    aria-hidden
                  >
                    {rune.glyph}
                  </span>
                ))}
              </div>

              {/* Fighters */}
              <div className="absolute bottom-6 left-[10%] sm:left-[16%]">
                <SheetFighter
                  fighterClass={creatorFighter.fighterClass}
                  state={sideState("creator")}
                  facing="right"
                  size={180}
                  animKey={spriteAnimKey}
                />
                {fx && fx.target === "creator" && (
                  <DamageNumber key={fx.id} fx={fx} />
                )}
              </div>
              <div className="absolute bottom-6 right-[10%] sm:right-[16%]">
                <SheetFighter
                  fighterClass={challengerFighter.fighterClass}
                  state={sideState("challenger")}
                  facing="left"
                  size={180}
                  animKey={spriteAnimKey}
                />
                {fx && fx.target === "challenger" && (
                  <DamageNumber key={fx.id} fx={fx} />
                )}
              </div>

              {/* Center overlays */}
              {stage === "faceoff" && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-1">
                    <p className="animate-pop-in whitespace-nowrap bg-gradient-to-r from-red-300 via-amber-200 to-orange-300 bg-clip-text text-4xl font-black tracking-widest text-transparent drop-shadow-[0_0_22px_rgba(239,68,68,0.9)] sm:text-5xl">
                      ⚔️ FIGHT!
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-zinc-400">
                      {creatorFighter.name} vs {challengerFighter.name}
                    </p>
                  </div>
                </div>
              )}
              {stage === "secondwind" && (
                <>
                  <div
                    className="animate-second-wind-flash pointer-events-none absolute inset-0 z-20 bg-gradient-to-br from-purple-600/70 via-transparent to-amber-400/60"
                    aria-hidden
                  />
                  <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
                    <div className="animate-pop-in rounded-2xl border-2 border-purple-400/60 bg-black/85 px-8 py-6 text-center shadow-[0_0_50px_rgba(168,85,247,0.6)]">
                      <p className="text-5xl">🛡️</p>
                      <h3 className="mt-3 bg-gradient-to-r from-purple-200 via-amber-200 to-purple-200 bg-clip-text text-xl font-extrabold tracking-wide text-transparent sm:text-2xl">
                        SECOND WIND TRIGGERED!
                      </h3>
                      <p className="mt-1.5 text-xs font-bold uppercase tracking-widest text-purple-300">
                        20% CHOG NFT PERK
                      </p>
                    </div>
                  </div>
                </>
              )}
              {stage === "suddendeath" && (
                <div className="pointer-events-none absolute inset-x-0 top-1/2 z-30 flex -translate-y-1/2 justify-center">
                  <p className="animate-pop-in whitespace-nowrap rounded-full border border-amber-400/50 bg-black/80 px-6 py-2.5 text-lg font-black tracking-widest text-amber-200 shadow-[0_0_30px_rgba(251,191,36,0.5)] sm:text-2xl">
                    ☠️ SUDDEN DEATH CLASH!
                  </p>
                </div>
              )}
            </div>

            {/* Combat log */}
            <div className="mx-4 mb-5 mt-3 rounded-xl border border-white/10 bg-black/60 sm:mx-6">
              <p className="border-b border-white/5 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                Combat Log
              </p>
              <div className="h-20 space-y-1 overflow-y-auto px-4 py-2.5">
                {logLines.map((line, i) => (
                  <p
                    key={i}
                    className={cn(
                      "font-mono text-[11px] leading-relaxed",
                      line.startsWith("🛡️") || line.startsWith("☠️")
                        ? "text-purple-300"
                        : line.startsWith("💥")
                          ? "text-amber-300"
                          : line.startsWith("💰")
                            ? "text-amber-200/80"
                            : "text-zinc-300",
                    )}
                  >
                    {line}
                  </p>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          </>
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
      <FighterAvatarBadge address={fighter.address} size="sm" />
      <div className={cn("min-w-0", align === "right" && "text-right")}>
        <p className="truncate text-xs font-extrabold text-zinc-100">
          {fighter.name}
        </p>
        <p
          className="truncate text-[9px] font-bold uppercase tracking-wider"
          style={{ color: theme.secondary }}
        >
          {theme.label}
          {fighter.title ? ` · ${fighter.title}` : ""}
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

function DamageNumber({ fx }: { fx: Fx }) {
  return (
    <p
      className={cn(
        "animate-damage-float pointer-events-none absolute -top-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap font-black",
        fx.crit
          ? "text-lg text-amber-300 drop-shadow-[0_0_10px_rgba(251,191,36,0.9)]"
          : "text-base text-red-300 drop-shadow-[0_0_8px_rgba(239,68,68,0.9)]",
      )}
    >
      {fx.suddenDeath ? "☠️ " : ""}
      -{fx.dmg} HP{fx.crit ? " 💥 CRIT!" : ""}
    </p>
  );
}

/* ------------------------------------------------------------- verdict screen */

function VerdictScreen({
  outcome,
  creatorName,
  challengerName,
  creatorFighter,
  challengerFighter,
  revivedName,
  finalBlowLog,
  explorerTxUrl,
  onClose,
}: {
  outcome: DuelOutcome;
  creatorName: string;
  challengerName: string;
  creatorFighter: FighterDescriptor;
  challengerFighter: FighterDescriptor;
  revivedName: string | null;
  finalBlowLog: string;
  explorerTxUrl?: string;
  onClose: () => void;
}) {
  const won = outcome.userWon;
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
          <SheetFighter
            fighterClass={loserDescriptor.fighterClass}
            state="dead"
            facing="right"
            size={110}
          />
          <SheetFighter
            fighterClass={winnerDescriptor.fighterClass}
            state="victory"
            facing="left"
            size={140}
            animKey="verdict"
          />
        </div>

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
            +{formatMon(outcome.payout)} MON
          </span>{" "}
          in Duel #{outcome.duelId}
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

      {/* Final blow breakdown */}
      <p className="mx-auto mt-5 max-w-md rounded-xl border border-white/10 bg-black/50 px-4 py-2.5 font-mono text-[11px] text-zinc-400">
        {finalBlowLog}
        {outcome.secondWind && revivedName && (
          <>
            {" · "}
            <span className="text-purple-300">
              {revivedName} was resurrected by Second Wind
            </span>
          </>
        )}
      </p>

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

      <div className="mt-7 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={onClose}
          className={cn(
            "rounded-xl bg-gradient-to-r px-8 py-3 text-sm font-extrabold tracking-wide text-white shadow-lg transition",
            won
              ? "from-emerald-600 to-lime-600 shadow-emerald-600/30 hover:from-emerald-500 hover:to-lime-500"
              : "from-rose-600 to-red-600 shadow-rose-600/30 hover:from-rose-500 hover:to-red-500",
          )}
        >
          Play Again / Back to Lobby
        </button>
        {outcome.txHash && explorerTxUrl && (
          <a
            href={explorerTxUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-mono text-[11px] text-zinc-500 underline-offset-2 transition hover:text-zinc-300 hover:underline"
          >
            <ExternalLink className="h-3 w-3" aria-hidden />
            View tx {truncateAddress(outcome.txHash)}
          </a>
        )}
        </div>
      </div>
    </div>
  );
}
