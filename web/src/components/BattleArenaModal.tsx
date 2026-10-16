"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Loader2, SkipForward, Swords } from "lucide-react";
import { FighterAvatarBadge } from "@/context/FighterProfileContext";
import type { FighterClass } from "@/config/fighterClasses";
import { FIGHTER_CLASS_META } from "@/config/fighterClasses";
import type { SpriteState } from "./FighterSprite";
import { SheetFighter } from "./ChogzillaSprite";
import { cn, formatMon, truncateAddress } from "@/lib/utils";
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
export type FighterDescriptor = {
  address: `0x${string}`;
  name: string;
  title?: string;
  fighterClass: FighterClass;
};

type Side = "creator" | "challenger";

type Stage =
  | "faceoff"
  | "roundintro"
  | "combat"
  | "ko"
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
};

type BattleArenaModalProps = {
  outcome: DuelOutcome | null;
  creatorFighter: FighterDescriptor;
  challengerFighter: FighterDescriptor;
  explorerTxUrl?: string;
  /** Timeline only starts when this is true AND outcome is confirmed. */
  isOpen?: boolean;
  /** Verdict "Play Again" — re-runs the on-chain stake flow for a rematch. */
  onPlayAgain?: () => void;
  /** While the rematch stake is awaiting wallet/chain confirmation. */
  onPlayAgainBusy?: boolean;
  onClose: () => void;
};

/**
 * Street-Fighter-style 3-round battle stage driven by a SINGLE async match
 * sequencer (no reactive per-round useEffect chains). The timeline starts
 * only when `isOpen` && a confirmed `outcome` exist, runs rounds 1→2→3 with
 * close-range melee exchanges, and always ends on the real on-chain winner.
 */
export function BattleArenaModal({
  outcome,
  creatorFighter,
  challengerFighter,
  explorerTxUrl,
  isOpen = true,
  onPlayAgain,
  onPlayAgainBusy = false,
  onClose,
}: BattleArenaModalProps) {
  const [stage, setStage] = useState<Stage>("faceoff");
  const [round, setRound] = useState<1 | 2 | 3>(1);
  const [hp, setHp] = useState<{ creator: number; challenger: number }>({
    creator: 100,
    challenger: 100,
  });
  const [fx, setFx] = useState<Fx | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [orbScore, setOrbScore] = useState<{ creator: number; challenger: number }>(
    { creator: 0, challenger: 0 },
  );
  const [slamFx, setSlamFx] = useState<{ id: number; target: Side } | null>(
    null,
  );
  const [portalFx, setPortalFx] = useState<{ id: number; target: Side } | null>(
    null,
  );
  const [chogFx, setChogFx] = useState<{ id: number; target: Side } | null>(
    null,
  );
  const [samuraiFx, setSamuraiFx] = useState<{ id: number; target: Side } | null>(
    null,
  );
  const [impactFx, setImpactFx] = useState<{ id: number } | null>(null);
  const [hitStop, setHitStop] = useState(false);
  const [camShake, setCamShake] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [timer, setTimer] = useState(99);
  const [finalBlowLog, setFinalBlowLog] = useState<string>("");

  const matchRunningRef = useRef(false);
  const skipRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const nameOf = (side: Side): string =>
    side === "creator" ? creatorFighter.name : challengerFighter.name;

  /* Winner/loser sides + Second Wind resolution — computed once. */
  const script = useMemo(() => {
    if (!outcome) return null;
    const creatorWon =
      outcome.winnerAddress.toLowerCase() ===
      creatorFighter.address.toLowerCase();
    const finalWinnerSide: Side = creatorWon ? "creator" : "challenger";
    const loserSide: Side = creatorWon ? "challenger" : "creator";
    const revivedSide: Side | null = outcome.secondWind ? loserSide : null;
    const revivedWins =
      revivedSide != null &&
      outcome.resurrectedAddress != null &&
      outcome.winnerAddress.toLowerCase() ===
        outcome.resurrectedAddress.toLowerCase();
    const isJames = (side: Side): boolean =>
      (side === "creator" ? creatorFighter : challengerFighter)
        .fighterClass === "mage";
    const isKeone = (side: Side): boolean =>
      (side === "creator" ? creatorFighter : challengerFighter)
        .fighterClass === "juggernaut";
    const isChogzilla = (side: Side): boolean =>
      (side === "creator" ? creatorFighter : challengerFighter)
        .fighterClass === "berserker";
    const isSamurai = (side: Side): boolean =>
      (side === "creator" ? creatorFighter : challengerFighter)
        .fighterClass === "samurai";
    return {
      finalWinnerSide,
      loserSide,
      revivedSide,
      revivedWins,
      isJames,
      isKeone,
      isChogzilla,
      isSamurai,
    };
  }, [
    outcome,
    creatorFighter.address,
    creatorFighter.fighterClass,
    challengerFighter.fighterClass,
  ]);

  /* Arcade timer ticks while the stage is live. */
  useEffect(() => {
    if (stage === "faceoff" || stage === "verdict") return;
    const interval = setInterval(() => {
      setTimer((t) => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [stage]);

  /* Keep the combat log pinned to the latest line. */
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [logLines]);

  /* Clear the Void Claw slam shockwave after its ring plays out. */
  useEffect(() => {
    if (!slamFx) return;
    const timeout = setTimeout(() => setSlamFx(null), 650);
    return () => clearTimeout(timeout);
  }, [slamFx]);

  /* Clear the Keone portal burst after its bloom plays out. */
  useEffect(() => {
    if (!portalFx) return;
    const timeout = setTimeout(() => setPortalFx(null), 750);
    return () => clearTimeout(timeout);
  }, [portalFx]);

  /* Clear the Chogzilla ground-pound + Samurai slash bursts. */
  useEffect(() => {
    if (!chogFx) return;
    const timeout = setTimeout(() => setChogFx(null), 750);
    return () => clearTimeout(timeout);
  }, [chogFx]);
  useEffect(() => {
    if (!samuraiFx) return;
    const timeout = setTimeout(() => setSamuraiFx(null), 800);
    return () => clearTimeout(timeout);
  }, [samuraiFx]);
  /* Clear the impact starburst. */
  useEffect(() => {
    if (!impactFx) return;
    const timeout = setTimeout(() => setImpactFx(null), 380);
    return () => clearTimeout(timeout);
  }, [impactFx]);

  /* ================= SINGLE ASYNC MATCH SEQUENCER =================
   * Runs the full 3-round fight sequentially. Never re-triggered by
   * round/HP state updates — only by isOpen + a fresh confirmed outcome. */
  useEffect(() => {
    if (!isOpen || !outcome || !script) return;
    if (matchRunningRef.current) return;
    matchRunningRef.current = true;
    skipRef.current = false;

    let cancelled = false;
    const aborted = () => cancelled || skipRef.current;
    const wait = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));

    /* Local HP model — deterministic, synced to state for rendering. */
    let hpState = { creator: 100, challenger: 100 };
    const setHpBoth = (next: { creator: number; challenger: number }) => {
      hpState = next;
      setHp(next);
    };
    const drain = (side: Side) => {
      const next = { ...hpState, [side]: 0 };
      setHpBoth(next);
    };
    const refill = () => setHpBoth({ creator: 100, challenger: 100 });

    const log = (line: string) => setLogLines((l) => [...l, line]);

    async function runExchange(
      attacker: Side,
      dmg: number,
      opts: { lethal?: boolean; suddenDeath?: boolean } = {},
    ) {
      const target: Side = attacker === "creator" ? "challenger" : "creator";
      const crit = Boolean(opts.lethal) || Math.random() < 0.25;
      const heavy = crit; // lethal always sets crit
      const signature = script!.isJames(attacker) && heavy;
      const keoneSig = script!.isKeone(attacker) && heavy;
      const chogSig = script!.isChogzilla(attacker) && heavy;
      const samuraiSig = script!.isSamurai(attacker) && heavy;

      setFx({ id: Date.now(), attacker, target, dmg, crit });
      playDashSfx();
      await wait(180);
      if (aborted()) return;
      playHitSfx();
      /* Anime impact starburst between the fighters on every clean hit. */
      setImpactFx({ id: Date.now() });
      if (signature) {
        playImpactSfx("slam");
        setSlamFx({ id: Date.now(), target });
        setHitStop(true);
        setTimeout(() => setHitStop(false), 100);
        setCamShake(true);
        setTimeout(() => setCamShake(false), 420);
      } else if (keoneSig) {
        /* Keone Mage — holographic portal + magenta lightning burst. */
        playImpactSfx("slam");
        setPortalFx({ id: Date.now(), target });
        setHitStop(true);
        setTimeout(() => setHitStop(false), 100);
        setCamShake(true);
        setTimeout(() => setCamShake(false), 420);
      } else if (chogSig) {
        /* Warlord Chogzilla — ground-pound shockwave + magma eruption. */
        playImpactSfx("slam");
        setChogFx({ id: Date.now(), target });
        setHitStop(true);
        setTimeout(() => setHitStop(false), 100);
        setCamShake(true);
        setTimeout(() => setCamShake(false), 420);
      } else if (samuraiSig) {
        /* Chog Samurai — multi-slash afterimages + crescent plasma beam. */
        playImpactSfx("crit");
        setSamuraiFx({ id: Date.now(), target });
        setHitStop(true);
        setTimeout(() => setHitStop(false), 100);
        setCamShake(true);
        setTimeout(() => setCamShake(false), 420);
      } else {
        playImpactSfx(crit ? "crit" : "slash");
        if (heavy) {
          /* Every heavy blow gets arcade-authentic freeze + shake. */
          setHitStop(true);
          setTimeout(() => setHitStop(false), 100);
          setCamShake(true);
          setTimeout(() => setCamShake(false), 360);
        }
      }

      if (opts.lethal || opts.suddenDeath) {
        drain(target);
      } else {
        const next = {
          ...hpState,
          [target]: Math.max(0, hpState[target] - dmg),
        };
        setHpBoth(next);
      }

      const attackerName = nameOf(attacker);
      let line: string;
      if (opts.suddenDeath) {
        line = `☠️ SUDDEN DEATH — ${attackerName} lands the finishing blow!`;
      } else if (opts.lethal) {
        line = signature
          ? `💜🔥 ${attackerName} — VOID CLAW SLAM knocks ${nameOf(target)} out!!`
          : keoneSig
            ? `🌀⚡ ${attackerName} — DIGITAL PORTAL SLAM K.O.s ${nameOf(target)}!!`
            : chogSig
              ? `🌋 ${attackerName} — MAGMA ERUPTION K.O.s ${nameOf(target)}!!`
              : samuraiSig
                ? `⚔️🌙 ${attackerName} — CRESCENT SLASH K.O.s ${nameOf(target)}!!`
                : `💥 ${attackerName} lands the K.O. blow!!`;
      } else if (signature) {
        line = `💜🔥 ${attackerName} — VOID CLAW SLAM for ${dmg} DMG!!`;
      } else if (keoneSig) {
        line = `🌀⚡ ${attackerName} — DIGITAL PORTAL SLAM for ${dmg} DMG!!`;
      } else if (chogSig) {
        line = `🌋 ${attackerName} — GROUND POUND MAGMA ERUPTION for ${dmg} DMG!!`;
      } else if (samuraiSig) {
        line = `⚔️🌙 ${attackerName} — CRESCENT MULTI-SLASH for ${dmg} DMG!!`;
      } else if (crit) {
        line = `💥 ${attackerName} CRITS for ${dmg} DMG!`;
      } else {
        line = `⚡ ${attackerName} strikes for ${dmg} DMG!`;
      }
      log(line);

      await wait(270);
      if (aborted()) return;
      setFx(null);
      await wait(300);
    }

    async function runRound(
      roundNo: 1 | 2 | 3,
      roundWinnerSide: Side,
    ) {
      if (aborted()) return;
      refill();
      setRound(roundNo);
      setStage("roundintro");
      setBanner(roundNo === 3 ? "ROUND 3 // FINAL ROUND!" : `ROUND ${roundNo} // FIGHT!`);
      playRoundAnnouncement(roundNo); // exactly once per round per match
      log(
        roundNo === 3
          ? "🔊 ROUND 3 — FINAL ROUND — FIGHT!"
          : `🔊 ROUND ${roundNo} — FIGHT!`,
      );
      await wait(1200);
      if (aborted()) return;

      setBanner(null);
      setStage("combat");

      const roundLoser: Side =
        roundWinnerSide === "creator" ? "challenger" : "creator";
      const exchanges =
        roundNo === 3
          ? 10 + Math.floor(Math.random() * 3) // 10–12 intense
          : 8 + Math.floor(Math.random() * 3); // 8–10

      for (let i = 0; i < exchanges; i += 1) {
        if (aborted()) return;
        const isFinal = i === exchanges - 1;
        /* Round loser pressures first; the round winner lands the K.O. */
        let attacker: Side =
          i % 2 === 0 ? roundLoser : roundWinnerSide;
        if (isFinal) attacker = roundWinnerSide;
        const dmg = 10 + Math.floor(Math.random() * 9); // 10–18
        await runExchange(attacker, dmg, { lethal: isFinal });
        if (aborted()) return;
      }

      /* K.O. — award the round orb. */
      setStage("ko");
      setBanner(`ROUND ${roundNo} K.O.!`);
      setOrbScore((prev) => ({ ...prev, [roundWinnerSide]: prev[roundWinnerSide] + 1 }));
      setFinalBlowLog(
        `⚡ ${nameOf(roundWinnerSide)} won Round ${roundNo} by K.O.`,
      );
      log(`🏆 ROUND ${roundNo} K.O. — ${nameOf(roundWinnerSide)} takes the round!`);
      await wait(1600);
      if (aborted()) return;
      setBanner(null);
    }

    async function runFullMatch() {
      resetArenaAudio();
      setStage("faceoff");
      setRound(1);
      setHpBoth({ creator: 100, challenger: 100 });
      setOrbScore({ creator: 0, challenger: 0 });
      setFx(null);
      setBanner(null);
      setSlamFx(null);
      setPortalFx(null);
      setChogFx(null);
      setSamuraiFx(null);
      setImpactFx(null);
      setFinalBlowLog("");
      setTimer(99);
      setLogLines([
        `⚔️ Duel #${outcome!.duelId} — ${nameOf("creator")} vs ${nameOf("challenger")}!`,
        `💰 Prize pot: ${formatMon(outcome!.pot)} MON on the line!`,
        `🥊 Best of 3 rounds — Round 1 upcoming!`,
      ]);
      await wait(1000);
      if (aborted()) return;

      /* ROUND 1 — the final loser takes it (1–0). */
      await runRound(1, script!.loserSide);
      if (aborted()) return;

      /* ROUND 2 — the winner mounts the comeback (1–1). */
      await runRound(2, script!.finalWinnerSide);
      if (aborted()) return;

      /* ROUND 3 — FINAL ROUND decides the real on-chain winner. */
      await runRound(3, script!.finalWinnerSide);
      if (aborted()) return;

      /* Second Wind fires inside Round 3 when the roll hit. */
      if (script!.revivedSide) {
        const revived = script!.revivedSide;
        setStage("down");
        await wait(800);
        if (aborted()) return;

        setStage("secondwind");
        playSecondWindSfx();
        log(`🛡️ SECOND WIND! ${nameOf(revived)} resurrects with 50 HP!`);
        setHpBoth({
          creator: revived === "creator" ? 50 : hpState.creator,
          challenger: revived === "challenger" ? 50 : hpState.challenger,
        });
        await wait(2200);
        if (aborted()) return;

        /* Sudden-death clash — finisher honors revivedWins. */
        setStage("suddendeath");
        setBanner("☠️ SUDDEN DEATH!");
        log("☠️ SUDDEN DEATH — next blow decides everything!");
        await wait(900);
        if (aborted()) return;
        setBanner(null);

        const finisher: Side = script!.revivedWins ? revived : script!.finalWinnerSide;
        const opener: Side = finisher === "creator" ? "challenger" : "creator";
        await runExchange(opener, 10 + Math.floor(Math.random() * 9));
        if (aborted()) return;
        await runExchange(finisher, 0, { lethal: true, suddenDeath: true });
        if (aborted()) return;
        setFinalBlowLog(
          `☠️ SUDDEN DEATH — ${nameOf(finisher)} landed the finishing blow`,
        );
      } else {
        setFinalBlowLog(
          script!.isJames(script!.finalWinnerSide)
            ? `💜🔥 ${nameOf(script!.finalWinnerSide)} landed the VOID CLAW SLAM final blow`
            : script!.isKeone(script!.finalWinnerSide)
              ? `🌀⚡ ${nameOf(script!.finalWinnerSide)} landed the DIGITAL PORTAL SLAM final blow`
              : `💥 ${nameOf(script!.finalWinnerSide)} landed the K.O. final blow`,
        );
      }

      setStage("verdict");
    }

    /* Note: only the cleanup resets matchRunningRef — a finally-block reset
     * could clobber a StrictMode remount's in-flight second run. */
    void runFullMatch();

    return () => {
      cancelled = true;
      stopArenaAudio();
      matchRunningRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, outcome]);

  function skipToVerdict() {
    skipRef.current = true;
    stopArenaAudio();
    setBanner(null);
    setFx(null);
    setSlamFx(null);
    setPortalFx(null);
    setChogFx(null);
    setSamuraiFx(null);
    setImpactFx(null);
    setStage("verdict");
  }

  /* Sprite state machine per side. */
  function sideState(side: Side): SpriteState {
    if (!script) return "idle";
    if (stage === "verdict")
      return side === script.finalWinnerSide ? "victory" : "dead";
    if (stage === "down")
      return side === script.loserSide ? "dead" : "idle";
    if (stage === "secondwind")
      return side === script.revivedSide ? "secondWind" : "idle";
    if (!fx) return "idle";
    if (fx.attacker === side) return "attack";
    if (fx.target === side) return "hit";
    return "idle";
  }

  if (!outcome || !script) return null;

  const fighting = stage !== "verdict";
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

        {/* ================= FINAL VERDICT ================= */}
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
            onPlayAgain={onPlayAgain}
            onPlayAgainBusy={onPlayAgainBusy}
            onClose={onClose}
          />
        ) : (
          <>
            {/* ============ ARCADE HUD ============ */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-white/10 bg-black/70 px-3 pb-3 pt-4 sm:gap-4 sm:px-6">
              <HudSide fighter={creatorFighter} hp={hp.creator} align="left" />
              <div className="flex flex-col items-center gap-0.5 px-1">
                <p className="font-mono text-2xl font-black tabular-nums text-amber-300 drop-shadow-[0_0_10px_rgba(251,191,36,0.6)]">
                  {String(timer).padStart(2, "0")}
                </p>
                <p className="whitespace-nowrap bg-gradient-to-r from-amber-300 to-orange-300 bg-clip-text text-xs font-extrabold text-transparent">
                  {formatMon(outcome.pot)} MON
                </p>
                <p className="whitespace-nowrap text-[9px] font-bold uppercase tracking-widest text-red-300/90">
                  {round === 3 ? "FINAL ROUND" : `ROUND ${round}`} · Orbs{" "}
                  <span className="text-amber-300">
                    {orbScore.creator}–{orbScore.challenger}
                  </span>
                </p>
              </div>
              <HudSide
                fighter={challengerFighter}
                hp={hp.challenger}
                align="right"
              />
            </div>

            {/* ============ 2D BATTLE STAGE ============ */}
            <div
              className={cn(
                "relative h-[320px] overflow-hidden sm:h-[360px]",
                camShake && "arena-cam-shake",
                hitStop && "arena-hit-stop",
              )}
            >
              {/* Arena background art */}
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: "url(/assets/arena-background.jpg)" }}
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

              {/* Fighters — close-range spacing (18% in) */}
              <div
                key={`creator-${fx?.id ?? "idle"}`}
                className={cn(
                  "absolute bottom-6 left-[18%]",
                  fx?.attacker === "creator" &&
                    (stage === "combat" || stage === "suddendeath") &&
                    "battle-lunge-right",
                )}
              >
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
              <div
                key={`challenger-${fx?.id ?? "idle"}`}
                className={cn(
                  "absolute bottom-6 right-[18%]",
                  fx?.attacker === "challenger" &&
                    (stage === "combat" || stage === "suddendeath") &&
                    "battle-lunge-left",
                )}
              >
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

              {/* VOID CLAW SLAM — shockwave ring + jagged lightning + void runes */}
              {slamFx && (
                <>
                  <div
                    key={`ring-${slamFx.id}`}
                    className="void-slam-ring pointer-events-none absolute z-20 h-44 w-44"
                    style={{
                      left: slamFx.target === "creator" ? "22%" : "78%",
                      top: "58%",
                    }}
                    aria-hidden
                  />
                  <VoidLightning key={`bolt-${slamFx.id}`} side={slamFx.target} />
                  {/* Floating void runes */}
                  {["ᚠ", "ᚢ", "ᚦ", "ᚨ"].map((glyph, i) => (
                    <span
                      key={`${slamFx.id}-${glyph}`}
                      className="rune-float pointer-events-none absolute z-[26] text-xl font-bold text-purple-300"
                      style={{
                        left: `calc(${slamFx.target === "creator" ? "22%" : "78%"} + ${(i - 1.5) * 30}px)`,
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
              )}

              {/* Keone Mage — holographic portal + magenta lightning burst */}
              {portalFx && (
                <KeonePortalFx key={`portal-${portalFx.id}`} side={portalFx.target} />
              )}

              {/* Warlord Chogzilla — ground-pound + magma eruption */}
              {chogFx && (
                <ChogzillaSlamFx key={`chog-${chogFx.id}`} side={chogFx.target} />
              )}

              {/* Chog Samurai — multi-slash afterimages + crescent plasma beam */}
              {samuraiFx && (
                <SamuraiSlashFx key={`sam-${samuraiFx.id}`} side={samuraiFx.target} />
              )}

              {/* Anime impact starburst between the fighters */}
              {impactFx && <ImpactStarburst key={`burst-${impactFx.id}`} />}

              {/* Banner overlays: ROUND N // FIGHT!, K.O., SUDDEN DEATH */}
              {banner && (
                <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
                  <div className="animate-round-banner text-center">
                    <p className="whitespace-nowrap bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-200 bg-clip-text text-4xl font-black tracking-[0.15em] text-transparent drop-shadow-[0_0_26px_rgba(251,191,36,0.85)] sm:text-5xl">
                      {banner}
                    </p>
                    {stage === "roundintro" && (
                      <p className="mt-1 text-lg font-black uppercase tracking-[0.5em] text-red-400 drop-shadow-[0_0_14px_rgba(239,68,68,0.8)]">
                        FIGHT!
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Face-off intro */}
              {stage === "faceoff" && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-1">
                    <p className="animate-pop-in whitespace-nowrap bg-gradient-to-r from-red-300 via-amber-200 to-orange-300 bg-clip-text text-4xl font-black tracking-widest text-transparent drop-shadow-[0_0_22px_rgba(239,68,68,0.9)] sm:text-5xl">
                      ⚔️ READY?
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-zinc-400">
                      {creatorFighter.name} vs {challengerFighter.name} · Best
                      of 3
                    </p>
                  </div>
                </div>
              )}

              {/* Second Wind flash */}
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
                        : line.startsWith("💥") || line.startsWith("🏆")
                          ? "text-amber-300"
                          : line.startsWith("💜")
                            ? "text-fuchsia-300"
                            : line.startsWith("💰")
                              ? "text-amber-200/80"
                              : line.startsWith("🔊")
                                ? "text-red-300"
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
        "animate-damage-arc pointer-events-none absolute -top-3 left-1/2 z-10 whitespace-nowrap font-black",
        fx.crit
          ? "text-lg text-amber-300 drop-shadow-[0_0_10px_rgba(251,191,36,0.9)]"
          : "text-base text-red-300 drop-shadow-[0_0_8px_rgba(239,68,68,0.9)]",
      )}
    >
      -{fx.dmg} HP{fx.crit ? " 💥 CRIT!" : ""}
    </p>
  );
}

/** Anime impact starburst between the two fighters on every clean strike. */
function ImpactStarburst() {
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-[52%] z-[27] -translate-x-1/2 -translate-y-1/2"
      aria-hidden
    >
      <span className="impact-starburst block text-4xl leading-none">💥</span>
    </div>
  );
}

/** Warlord Chogzilla — ground-pound shockwave, blade trail, magma particles. */
function ChogzillaSlamFx({ side }: { side: Side }) {
  const center = side === "creator" ? "22%" : "78%";
  return (
    <div className="pointer-events-none absolute inset-0 z-[25]" aria-hidden>
      {/* Ground-pound shockwave ring */}
      <div
        className="ground-pound-ring absolute h-44 w-44 rounded-full"
        style={{
          left: center,
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
          left: center,
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
            left: `calc(${center} + ${((i % 4) - 1.5) * 26}px)`,
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
function SamuraiSlashFx({ side }: { side: Side }) {
  const center = side === "creator" ? "22%" : "78%";
  return (
    <div className="pointer-events-none absolute inset-0 z-[25]" aria-hidden>
      {/* High-speed multi-slash afterimage streaks */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="slash-streak absolute h-1.5 w-44"
          style={{
            left: center,
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
        style={{ left: center, top: "36%", transform: "translateX(-50%)" }}
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
            left: `calc(${center} + ${((i % 3) - 1) * 34}px)`,
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
function VoidLightning({ side }: { side: Side }) {
  return (
    <div
      className={cn(
        "void-lightning pointer-events-none absolute bottom-4 z-30 h-48 w-40",
        side === "creator" ? "left-[12%]" : "right-[12%]",
      )}
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

/** Keone Mage signature — holographic purple/magenta portal + lightning burst. */
function KeonePortalFx({ side }: { side: Side }) {
  const center = side === "creator" ? "22%" : "78%";
  return (
    <div className="pointer-events-none absolute inset-0 z-[25]" aria-hidden>
      {/* Holographic portal ring */}
      <div
        className="keone-portal-bloom absolute h-40 w-40 rounded-full"
        style={{
          left: center,
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
          left: center,
          top: "56%",
          background:
            "radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(232,121,249,0.55) 40%, transparent 72%)",
        }}
      />
      {/* Magenta/cyan lightning bolts across the target */}
      <svg
        className="void-lightning absolute bottom-4 h-48 w-40"
        style={{ left: side === "creator" ? "14%" : "auto", right: side === "creator" ? "auto" : "14%" }}
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
            left: `calc(${center} + ${(i - 1) * 48}px)`,
            top: `${26 + i * 11}%`,
            animationDelay: `${i * 80}ms`,
          }}
        />
      ))}
      {/* Purple laser beam */}
      <div
        className="laser-beam absolute h-2.5 w-72"
        style={{
          left: center,
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
            left: center,
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
  creatorName,
  challengerName,
  creatorFighter,
  challengerFighter,
  revivedName,
  finalBlowLog,
  explorerTxUrl,
  onPlayAgain,
  onPlayAgainBusy = false,
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
  onPlayAgain?: () => void;
  onPlayAgainBusy?: boolean;
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
