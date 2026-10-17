"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ExternalLink, Loader2, Swords } from "lucide-react";
import { useFighterProfile } from "@/context/FighterProfileContext";
import type { FighterClass } from "@/config/fighterClasses";
import { FIGHTER_CLASS_META } from "@/config/fighterClasses";
import type { SpriteState } from "./FighterSprite";
import { SheetFighter } from "./ChogzillaSprite";
import {
  getFighterMoveSet,
  impactCueFor,
  type SpecialMove,
} from "@/data/fighterMoves";
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

/** Per-class visual scale — sheet art fills its frame very differently
 * (Chogzilla art is edge-to-edge; Keone/James art sits small in-frame). */
const CLASS_SIZE_SCALE: Record<FighterClass, number> = {
  berserker: 0.72,
  samurai: 0.92,
  mage: 1.1,
  juggernaut: 1.1,
};

function stageSize(f: FighterDescriptor, narrow = false): number {
  /* Narrow viewports (< 640px) scale both fighters down proportionally so
   * there is room to dash and trade combos cleanly on a phone. */
  return Math.round(
    225 * (CLASS_SIZE_SCALE[f.fighterClass] ?? 1) * (narrow ? 0.68 : 1),
  );
}

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
  /** Combo choreography phase — dashIn → strike → stagger → dashOut. */
  phase: "dashIn" | "strike" | "stagger" | "dashOut";
  /** Multi-hit count for signature/critical moves (displays as ×N). */
  hits?: number;
  /** Active character's exact move name from fighterMoves config. */
  moveName?: string;
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
  const [dustFx, setDustFx] = useState<{ id: number; side: Side } | null>(null);
  const [combo, setCombo] = useState<{
    id: number;
    count: number;
    side: Side;
  } | null>(null);
  const [cinematic, setCinematic] = useState<{
    id: number;
    kind: "critical" | "counter" | "ko";
    moveName?: string;
  } | null>(null);
  const [hitStop, setHitStop] = useState(false);
  const [camShake, setCamShake] = useState(false);
  const [timer, setTimer] = useState(99);

  /* ---- Manual arcade controls (cosmetic assist over the scripted match) ----
   * The on-chain duel is already settled; these bindings give the player a
   * real PC (keyboard/mouse) + mobile (touch gamepad) feel — stance leans,
   * guard blocks, strike flourishes, and a super meter gating Special /
   * Critical Art flair — WITHOUT altering the scripted winner or pacing. */
  const [playerStance, setPlayerStance] = useState<
    "neutral" | "back" | "block" | "dash"
  >("neutral");
  const [superMeter, setSuperMeter] = useState(0);
  const [assistFlourish, setAssistFlourish] = useState<{
    id: number;
    kind: "light" | "heavy" | "special" | "critical";
  } | null>(null);
  const [narrow, setNarrow] = useState(false);

  const matchRunningRef = useRef(false);
  const comboRef = useRef(0);
  const playerStanceRef = useRef(playerStance);
  playerStanceRef.current = playerStance;
  const assistTimersRef = useRef<number[]>([]);

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

  /* Clear the dash-in dust puffs. */
  useEffect(() => {
    if (!dustFx) return;
    const timeout = setTimeout(() => setDustFx(null), 500);
    return () => clearTimeout(timeout);
  }, [dustFx]);

  /* Clear the cinematic camera zoom + big text. */
  useEffect(() => {
    if (!cinematic) return;
    const timeout = setTimeout(() => setCinematic(null), 750);
    return () => clearTimeout(timeout);
  }, [cinematic]);

  /* ================= SINGLE ASYNC MATCH SEQUENCER =================
   * Runs the full 3-round fight sequentially. Never re-triggered by
   * round/HP state updates — only by isOpen + a fresh confirmed outcome. */
  useEffect(() => {
    if (!isOpen || !outcome || !script) return;
    if (matchRunningRef.current) return;
    matchRunningRef.current = true;

    let cancelled = false;
    const aborted = () => cancelled;
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

    async function runExchange(
      attacker: Side,
      dmg: number,
      opts: { lethal?: boolean; suddenDeath?: boolean } = {},
    ) {
      const target: Side = attacker === "creator" ? "challenger" : "creator";
      const crit = Boolean(opts.lethal) || Math.random() < 0.25;
      const heavy = crit; // lethal always sets crit
      /* Data-driven moveset: signature on heavy, critical art on finishers. */
      const moveSet = getFighterMoveSet(
        (attacker === "creator" ? creatorFighter : challengerFighter)
          .fighterClass,
      );
      const move: SpecialMove | null = heavy
        ? opts.lethal || opts.suddenDeath
          ? moveSet.criticalArt
          : moveSet.signatureMove
        : null;

      /* ---- PHASE 1 — DASH IN (attacker slides across the floor, dust) ---- */
      setFx({
        id: Date.now(),
        attacker,
        target,
        dmg,
        crit,
        phase: "dashIn",
        hits: move?.hitCount,
        moveName: move?.name,
      });
      setDustFx({ id: Date.now(), side: attacker });
      playDashSfx();
      await wait(220);
      if (aborted()) return;

      /* ---- PHASE 2 — STRIKE (80ms hit-stop, shake, splash, combo++) ---- */
      playHitSfx();
      setFx((prev) => (prev ? { ...prev, phase: "strike" } : prev));
      /* Multi-hit supers add their full hitCount to the combo counter. */
      comboRef.current += move ? move.hitCount : 1;
      setCombo({ id: Date.now(), count: comboRef.current, side: attacker });
      setImpactFx({ id: Date.now() });
      setHitStop(true);
      setTimeout(() => setHitStop(false), 80);
      if (!move || move.screenShake) {
        setCamShake(true);
        setTimeout(() => setCamShake(false), heavy ? 420 : 300);
      }

      /* Cinematic camera: K.O. > COUNTER HIT (3+ combo) > CRITICAL ART. */
      if (heavy) {
        setCinematic({
          id: Date.now(),
          kind:
            opts.lethal || opts.suddenDeath
              ? "ko"
              : comboRef.current >= 3
                ? "counter"
                : "critical",
          moveName: move?.name,
        });
      }

      if (move) {
        playImpactSfx(impactCueFor(move.soundCue));
        switch (move.vfxType) {
          case "void_rift":
            setSlamFx({ id: Date.now(), target });
            break;
          case "laser":
            setPortalFx({ id: Date.now(), target });
            break;
          case "magma":
            setChogFx({ id: Date.now(), target });
            break;
          case "slash":
            setSamuraiFx({ id: Date.now(), target });
            break;
        }
      } else {
        playImpactSfx(crit ? "crit" : "slash");
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

      /* ---- PHASE 3 — STAGGER (defender reels back, sparks + red flash) ---- */
      await wait(160);
      if (aborted()) return;
      setFx((prev) => (prev ? { ...prev, phase: "stagger" } : prev));
      await wait(180);
      if (aborted()) return;

      /* ---- PHASE 4 — DASH OUT (attacker recovers to spacing) ---- */
      setFx((prev) => (prev ? { ...prev, phase: "dashOut" } : prev));
      await wait(100);
      if (aborted()) return;
      setFx(null);
      await wait(80);
    }

    async function runRound(
      roundNo: 1 | 2 | 3,
      roundWinnerSide: Side,
    ) {
      if (aborted()) return;
      refill();
      comboRef.current = 0;
      setCombo(null);
      setRound(roundNo);
      setStage("roundintro");
      setBanner(roundNo === 3 ? "ROUND 3 // FINAL ROUND!" : `ROUND ${roundNo} // FIGHT!`);
      playRoundAnnouncement(roundNo); // exactly once per round per match
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
      setDustFx(null);
      setCombo(null);
      setCinematic(null);
      comboRef.current = 0;
      setTimer(99);
      /* Fresh manual-control state for every match. */
      setPlayerStance("neutral");
      setAssistFlourish(null);
      setSuperMeter(0);
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
        setHpBoth({
          creator: revived === "creator" ? 50 : hpState.creator,
          challenger: revived === "challenger" ? 50 : hpState.challenger,
        });
        await wait(2200);
        if (aborted()) return;

        /* Sudden-death clash — finisher honors revivedWins. */
        setStage("suddendeath");
        setBanner("☠️ SUDDEN DEATH!");
        await wait(900);
        if (aborted()) return;
        setBanner(null);

        const finisher: Side = script!.revivedWins ? revived : script!.finalWinnerSide;
        const opener: Side = finisher === "creator" ? "challenger" : "creator";
        await runExchange(opener, 10 + Math.floor(Math.random() * 9));
        if (aborted()) return;
        await runExchange(finisher, 0, { lethal: true, suddenDeath: true });
        if (aborted()) return;
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

  /* Sprite state machine per side — tracks the combo choreography phases. */
  function sideState(side: Side): SpriteState {
    if (!script) return "idle";
    if (stage === "verdict")
      return side === script.finalWinnerSide ? "victory" : "dead";
    if (stage === "down")
      return side === script.loserSide ? "dead" : "idle";
    if (stage === "secondwind")
      return side === script.revivedSide ? "secondWind" : "idle";
    if (!fx) return "idle";
    if (fx.attacker === side) {
      if (fx.phase === "dashIn") return "dashIn";
      if (fx.phase === "dashOut") return "dashOut";
      return "attack"; // strike + stagger-hold
    }
    if (fx.target === side) {
      if (fx.phase === "dashIn") return "idle";
      if (fx.phase === "strike") return "hit";
      return "stagger"; // stagger + dashOut
    }
    return "idle";
  }

  /* Wrapper-level positional choreography for one exchange (single
   * 640ms keyframe per side: dash-in → impact lunge → knockback → recovery). */
  const inCombat = stage === "combat" || stage === "suddendeath";
  function attackerMotion(side: Side): string {
    if (!fx || !inCombat) return "";
    return side === "creator" ? "combo-advance-right" : "combo-advance-left";
  }
  function targetMotion(side: Side): string {
    if (!fx || !inCombat) return "";
    return side === "creator" ? "combo-recoil-left" : "combo-recoil-right";
  }
  function motionFor(side: Side): string {
    if (fx?.attacker === side) return attackerMotion(side);
    if (fx?.target === side) return targetMotion(side);
    return "";
  }

  /* ================= MANUAL ARCADE CONTROLS ================= */

  const strike = (
    kind: "light" | "heavy" | "special" | "critical",
  ): void => {
    if (!isOpen || stage === "verdict") return;
    if (kind === "special" && superMeter < 40) return;
    if (kind === "critical" && superMeter < 100) return;
    if (kind === "special") setSuperMeter((m) => Math.max(0, m - 40));
    if (kind === "critical") setSuperMeter(0);
    if (kind === "light") setSuperMeter((m) => Math.min(100, m + 8));
    if (kind === "heavy") setSuperMeter((m) => Math.min(100, m + 14));
    const id = Date.now() + Math.random();
    setAssistFlourish({ id, kind });
    const t = window.setTimeout(
      () => {
        setAssistFlourish((f) => (f?.id === id ? null : f));
        assistTimersRef.current = assistTimersRef.current.filter(
          (x) => x !== t,
        );
      },
      kind === "critical" ? 950 : 480,
    );
    assistTimersRef.current.push(t);
  };
  const strikeRef = useRef(strike);
  strikeRef.current = strike;

  /* PC keyboard: hold-to-stance on keydown/keyup, strikes fire on keydown. */
  useEffect(() => {
    if (!isOpen) return;
    const movement = new Map<string, "back" | "dash" | "block">([
      ["a", "back"],
      ["arrowleft", "back"],
      ["d", "dash"],
      ["arrowright", "dash"],
      ["s", "block"],
      ["arrowdown", "block"],
      ["shift", "block"],
    ]);
    const strikes = new Map<string, "light" | "heavy" | "special" | "critical">(
      [
        ["j", "light"],
        ["k", "heavy"],
        ["l", "special"],
        ["u", "critical"],
      ],
    );
    const onDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const stance = movement.get(k);
      if (stance) {
        e.preventDefault();
        setPlayerStance(stance);
      }
      const kind = strikes.get(k);
      if (kind) {
        e.preventDefault();
        if (!e.repeat) strikeRef.current(kind);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const stance = movement.get(e.key.toLowerCase());
      if (stance) {
        setPlayerStance((cur) => (cur === stance ? "neutral" : cur));
      }
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [isOpen]);

  /* Super meter fills with every exchange; blocking through an incoming
   * strike grants a perfect-guard bonus. */
  useEffect(() => {
    if (!fx) return;
    setSuperMeter((m) => Math.min(100, m + 6));
    if (playerStanceRef.current === "block" && fx.target === "creator") {
      setSuperMeter((m) => Math.min(100, m + 10));
    }
  }, [fx]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Clear pending flourish timers on unmount. */
  useEffect(
    () => () => {
      assistTimersRef.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );

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
  const spriteAnimKey = `${stage}-${fx?.id ?? 0}`;

  return (
    <div className="fixed inset-0 z-[95] flex h-[100dvh] items-center justify-center bg-black/90 p-2 backdrop-blur-sm sm:h-[90vh] sm:p-4">
      <div
        className="relative flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-red-500/30 bg-zinc-950 shadow-[0_0_70px_-10px_rgba(239,68,68,0.3)]"
        role="dialog"
        aria-modal="true"
      >
        {/* ================= FINAL VERDICT ================= */}
        {stage === "verdict" ? (
          <VerdictScreen
            outcome={outcome}
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
                "relative h-[38dvh] min-h-[260px] overflow-hidden sm:h-[470px]",
                camShake && "arena-cam-shake",
                hitStop && "arena-hit-stop",
                cinematic && "arena-cinematic-zoom",
              )}
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

              {/* Ambient fighter lighting — soft white/purple backlight
                  spots + floor light pools so the sprites read cleanly
                  against the darkened arena without any filters on them. */}
              {(["creator", "challenger"] as const).map((side) => {
                const anchor =
                  side === "creator"
                    ? { left: "32%", transform: "-translate-x-1/2" }
                    : { right: "32%", transform: "translate-x-1/2" };
                return (
                  <div key={`light-${side}`} aria-hidden>
                    {/* Backlight spot */}
                    <div
                      className={cn(
                        "pointer-events-none absolute bottom-8 h-56 w-56 rounded-full blur-xl",
                        anchor.transform,
                      )}
                      style={{
                        ...(side === "creator"
                          ? { left: anchor.left }
                          : { right: anchor.right }),
                        background:
                          "radial-gradient(circle, rgba(255,255,255,0.10), rgba(139,92,246,0.08) 50%, transparent 72%)",
                      }}
                    />
                    {/* Floor light pool */}
                    <div
                      className={cn(
                        "pointer-events-none absolute bottom-3 h-7 w-48 rounded-[50%] blur-md",
                        anchor.transform,
                      )}
                      style={{
                        ...(side === "creator"
                          ? { left: anchor.left }
                          : { right: anchor.right }),
                        background:
                          "radial-gradient(ellipse, rgba(196,181,253,0.22), rgba(168,85,247,0.10) 55%, transparent 75%)",
                      }}
                    />
                  </div>
                );
              })}

              {/* Fighters — face-to-face in the center foreground */}
              <div
                key={`creator-${fx?.id ?? "idle"}`}
                className={cn(
                  "sprite-pixelated absolute bottom-5 left-[32%]",
                  motionFor("creator"),
                )}
              >
                {/* Manual-control stance lean (back / dash / block) — a
                    nested transform so it composes with the exchange
                    choreography on the wrapper above. */}
                <div
                  className={cn(
                    "assist-stance",
                    playerStance === "back" && "assist-back",
                    playerStance === "dash" && "assist-dash",
                    playerStance === "block" && "assist-block",
                  )}
                >
                  <SheetFighter
                    fighterClass={creatorFighter.fighterClass}
                    state={sideState("creator")}
                    facing="right"
                    size={stageSize(creatorFighter, narrow)}
                    animKey={spriteAnimKey}
                  />
                </div>
                {fx && fx.target === "creator" && (
                  <DamageNumber key={fx.id} fx={fx} />
                )}
              </div>
              {/* Guard shimmer — only while the player is holding Block
                  through an incoming strike. */}
              {playerStance === "block" &&
                fx &&
                fx.target === "creator" &&
                (fx.phase === "strike" || fx.phase === "stagger") && (
                  <div
                    className="pointer-events-none absolute bottom-5 left-[32%] z-[25] h-28 w-28 -translate-x-1/2 rounded-full border-2 border-cyan-300/70 bg-cyan-300/10"
                    style={{ boxShadow: "0 0 20px rgba(34,211,238,0.5)" }}
                    aria-hidden
                  />
                )}
              <div
                key={`challenger-${fx?.id ?? "idle"}`}
                className={cn(
                  "sprite-pixelated absolute bottom-5 right-[32%]",
                  motionFor("challenger"),
                )}
              >
                <SheetFighter
                  fighterClass={challengerFighter.fighterClass}
                  state={sideState("challenger")}
                  facing="left"
                  size={stageSize(challengerFighter, narrow)}
                  animKey={spriteAnimKey}
                />
                {fx && fx.target === "challenger" && (
                  <DamageNumber key={fx.id} fx={fx} />
                )}
              </div>

              {/* Dash-in dust/smoke behind the attacker */}
              {dustFx && <DustFx key={`dust-${dustFx.id}`} side={dustFx.side} />}

              {/* Defender stagger: red flash frame + damage sparks */}
              {fx &&
                (fx.phase === "strike" || fx.phase === "stagger") && (
                  <>
                    <StaggerFlash
                      key={`flash-${fx.id}`}
                      side={fx.target}
                      bright={fx.phase === "strike"}
                    />
                    <DamageSparks key={`sparks-${fx.id}`} side={fx.target} />
                  </>
                )}

              {/* VOID CLAW SLAM — shockwave ring + jagged lightning + void runes */}
              {slamFx && (
                <>
                  <div
                    key={`ring-${slamFx.id}`}
                    className="void-slam-ring pointer-events-none absolute z-20 h-44 w-44"
                    style={{
                      left: slamFx.target === "creator" ? "32%" : "68%",
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
                        left: `calc(${slamFx.target === "creator" ? "32%" : "68%"} + ${(i - 1.5) * 30}px)`,
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

              {/* Cyberpunk hit-marker on every clean strike */}
              {impactFx && <NeonHitMarker key={`burst-${impactFx.id}`} />}

              {/* Floating combo hit counter */}
              {combo && (
                <div
                  key={`combo-${combo.id}`}
                  className="combo-pop pointer-events-none absolute left-1/2 top-2 z-[31] -translate-x-1/2 text-center"
                  aria-live="polite"
                >
                  <p
                    className={cn(
                      "combo-count-text whitespace-nowrap font-mono font-black italic tracking-[0.25em]",
                      combo.count >= 10
                        ? "text-4xl text-amber-300"
                        : "text-2xl text-orange-300",
                    )}
                  >
                    {combo.count >= 10
                      ? `${combo.count} HITS!`
                      : `${combo.count} Hit${combo.count > 1 ? "s" : ""}...`}
                  </p>
                </div>
              )}

              {/* Player strike flourishes — instant visual feedback for the
                  manual Light/Heavy/Special/Critical Art buttons. */}
              {assistFlourish && (
                <div
                  key={`assist-${assistFlourish.id}`}
                  className="pointer-events-none absolute inset-0 z-[31]"
                  aria-hidden
                >
                  {(assistFlourish.kind === "light" ||
                    assistFlourish.kind === "heavy") && (
                    <div className="absolute bottom-24 right-[30%]">
                      <span
                        className={cn(
                          "hit-marker-slash-a absolute h-1 w-16 rounded-full",
                          assistFlourish.kind === "heavy" && "scale-125",
                        )}
                        style={{
                          background:
                            "linear-gradient(90deg, transparent, #fff 50%, transparent)",
                          boxShadow: "0 0 12px rgba(251,191,36,0.9)",
                        }}
                      />
                      <span
                        className={cn(
                          "hit-marker-slash-b absolute h-1 w-16 rounded-full",
                          assistFlourish.kind === "heavy" && "scale-125",
                        )}
                        style={{
                          background:
                            "linear-gradient(90deg, transparent, #fde68a 50%, transparent)",
                          boxShadow: "0 0 12px rgba(251,191,36,0.9)",
                        }}
                      />
                      <span
                        className="hit-marker-core absolute h-6 w-6 rounded-full bg-amber-200"
                        style={{
                          boxShadow: "0 0 24px rgba(251,191,36,0.95)",
                        }}
                      />
                      <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-black uppercase tracking-widest text-amber-200 drop-shadow-[0_0_8px_rgba(251,191,36,0.9)]">
                        {assistFlourish.kind === "heavy" ? "HEAVY!" : "STRIKE!"}
                      </span>
                    </div>
                  )}
                  {assistFlourish.kind === "special" && (
                    <>
                      <div className="absolute inset-0 bg-fuchsia-500/10" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <p className="animate-round-banner whitespace-nowrap bg-gradient-to-r from-purple-300 via-white to-fuchsia-300 bg-clip-text text-3xl font-black italic tracking-[0.18em] text-transparent drop-shadow-[0_0_24px_rgba(168,85,247,0.9)] sm:text-4xl">
                          {getFighterMoveSet(creatorFighter.fighterClass)
                            .signatureMove.name
                            .toUpperCase()}
                          !
                        </p>
                      </div>
                    </>
                  )}
                  {assistFlourish.kind === "critical" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                      <div className="cinematic-flash absolute inset-0" />
                      <p className="cinematic-text whitespace-nowrap text-5xl bg-gradient-to-r from-red-400 via-amber-300 to-red-500 bg-clip-text font-black italic tracking-[0.12em] text-transparent drop-shadow-[0_0_24px_rgba(239,68,68,0.9)] sm:text-6xl">
                        CRITICAL ART
                      </p>
                      <p className="cinematic-move-name whitespace-nowrap text-xs font-black uppercase tracking-[0.35em] text-white/90 drop-shadow-[0_0_12px_rgba(255,255,255,0.6)] sm:text-sm">
                        {getFighterMoveSet(creatorFighter.fighterClass)
                          .criticalArt.name}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Cinematic camera: vignette + color flash + big arcade text */}
              {cinematic && (
                <div
                  key={`cine-${cinematic.id}`}
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
                        cinematic.kind === "ko" &&
                          "text-6xl text-amber-300 drop-shadow-[0_0_30px_rgba(251,191,36,0.95)] sm:text-7xl",
                        cinematic.kind === "critical" &&
                          "text-5xl bg-gradient-to-r from-red-400 via-amber-300 to-red-500 bg-clip-text text-transparent drop-shadow-[0_0_24px_rgba(239,68,68,0.9)] sm:text-6xl",
                        cinematic.kind === "counter" &&
                          "text-5xl bg-gradient-to-r from-cyan-300 via-white to-fuchsia-400 bg-clip-text text-transparent drop-shadow-[0_0_24px_rgba(34,211,238,0.9)] sm:text-6xl",
                      )}
                    >
                      {cinematic.kind === "ko"
                        ? "K.O."
                        : cinematic.kind === "critical"
                          ? "CRITICAL ART"
                          : "COUNTER HIT"}
                    </p>
                    {cinematic.moveName && (
                      <p className="cinematic-move-name whitespace-nowrap text-xs font-black uppercase tracking-[0.35em] text-white/90 drop-shadow-[0_0_12px_rgba(255,255,255,0.6)] sm:text-sm">
                        {cinematic.moveName}
                      </p>
                    )}
                  </div>
                </div>
              )}

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
                      style={{ width: `${superMeter}%` }}
                    />
                  </div>
                  <span className="w-10 text-right font-mono text-[10px] text-zinc-400">
                    {Math.round(superMeter)}%
                  </span>
                </div>

                <div className="flex flex-row items-center justify-between gap-2 px-3 py-2 sm:px-6 sm:py-4">
                  {/* LEFT THUMB — movement & guard */}
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    {(
                      [
                        { stance: "back", label: "Back", badge: "A" },
                        { stance: "block", label: "Block", badge: "S" },
                        { stance: "dash", label: "Dash", badge: "D" },
                      ] as const
                    ).map((b) => (
                      <button
                        key={b.stance}
                        type="button"
                        aria-label={`${b.label} (${b.badge})`}
                        className={cn(
                          "arcade-ctl-btn flex min-w-[62px] flex-col items-center justify-center rounded-xl border px-2.5 py-3 text-[11px] font-black uppercase tracking-wider transition-all active:scale-95 sm:min-w-[78px] sm:px-4",
                          playerStance === b.stance
                            ? "border-amber-400/80 bg-amber-500/25 text-amber-100 shadow-[0_0_16px_rgba(251,191,36,0.35)]"
                            : "border-white/15 bg-zinc-900/80 text-zinc-300",
                        )}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.currentTarget.setPointerCapture(e.pointerId);
                          setPlayerStance(b.stance);
                        }}
                        onPointerUp={() =>
                          setPlayerStance((cur) =>
                            cur === b.stance ? "neutral" : cur,
                          )
                        }
                        onPointerCancel={() =>
                          setPlayerStance((cur) =>
                            cur === b.stance ? "neutral" : cur,
                          )
                        }
                        onPointerLeave={() =>
                          setPlayerStance((cur) =>
                            cur === b.stance ? "neutral" : cur,
                          )
                        }
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
                        { kind: "light", label: "Light", badge: "J" },
                        { kind: "heavy", label: "Heavy", badge: "K" },
                        { kind: "special", label: "Special", badge: "L" },
                        { kind: "critical", label: "Crit Art", badge: "U" },
                      ] as const
                    ).map((b) => {
                      const ready =
                        b.kind === "special"
                          ? superMeter >= 40
                          : b.kind === "critical"
                            ? superMeter >= 100
                            : true;
                      return (
                        <button
                          key={b.kind}
                          type="button"
                          aria-label={`${b.label} (${b.badge})`}
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
                            strikeRef.current(b.kind);
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
          <SheetFighter fighterClass={fighter.fighterClass} state="idle" size={42} />
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

function DamageNumber({ fx }: { fx: Fx }) {
  return (
    <p
      className={cn(
        "animate-damage-arc pointer-events-none absolute -top-3 left-1/2 z-10 whitespace-nowrap font-mono text-base font-black italic tracking-wider",
        fx.crit
          ? "text-amber-300 drop-shadow-[0_0_10px_rgba(251,191,36,0.9)]"
          : "text-red-300 drop-shadow-[0_0_8px_rgba(239,68,68,0.9)]",
      )}
    >
      -{fx.dmg} HP
      {fx.hits && fx.hits > 1 ? ` ×${fx.hits}` : ""}
      {fx.crit ? (
        <span className="ml-1 text-[11px] font-bold tracking-[0.2em] text-amber-200">
          //CRIT
        </span>
      ) : ""}
      {fx.moveName && (
        <span className="mt-0.5 block text-center text-[10px] font-bold uppercase tracking-[0.25em] text-fuchsia-200 drop-shadow-[0_0_8px_rgba(232,121,249,0.85)]">
          {fx.moveName}
        </span>
      )}
    </p>
  );
}

/**
 * Cyberpunk hit-marker: neon slash cross (cyan/fuchsia), violet/gold
 * spark flyout, and a sleek white core flash — no cartoon explosions.
 */
function NeonHitMarker() {
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-[52%] z-[27]"
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
function DustFx({ side }: { side: Side }) {
  return (
    <div
      className="pointer-events-none absolute bottom-4 z-[18]"
      style={{
        left: side === "creator" ? "26%" : "auto",
        right: side === "creator" ? "auto" : "26%",
      }}
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
function StaggerFlash({
  side,
  bright,
}: {
  side: Side;
  /** true = strike phase (white-hot flash); false = stagger phase (red). */
  bright: boolean;
}) {
  return (
    <div
      className="stagger-flash pointer-events-none absolute bottom-12 z-[26] h-40 w-40 rounded-full blur-xl"
      style={{
        left: side === "creator" ? "24%" : "60%",
        background: bright
          ? "radial-gradient(circle, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.2) 45%, transparent 70%)"
          : "radial-gradient(circle, rgba(239,68,68,0.55) 0%, rgba(239,68,68,0.22) 45%, transparent 70%)",
      }}
      aria-hidden
    />
  );
}

/** Damage sparks radiating off the staggered defender. */
function DamageSparks({ side }: { side: Side }) {
  const center = side === "creator" ? "32%" : "68%";
  return (
    <div className="pointer-events-none absolute inset-0 z-[27]" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <span
          key={i}
          className="damage-spark absolute h-1.5 w-1.5 rounded-full"
          style={{
            left: `calc(${center} + ${((i % 3) - 1) * 28}px)`,
            top: `calc(46% + ${(i % 2 ? -1 : 1) * 16}px)`,
            background: i % 2 ? "#a78bfa" : "#fbbf24",
            boxShadow: `0 0 8px ${i % 2 ? "rgba(167,139,250,0.95)" : "rgba(251,191,36,0.95)"}`,
            animationDelay: `${i * 40}ms`,
          }}
        />
      ))}
    </div>
  );
}

/** Warlord Chogzilla — ground-pound shockwave, blade trail, magma particles. */
function ChogzillaSlamFx({ side }: { side: Side }) {
  const center = side === "creator" ? "32%" : "68%";
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
  const center = side === "creator" ? "32%" : "68%";
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
  const center = side === "creator" ? "32%" : "68%";
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
        style={{ left: side === "creator" ? "24%" : "auto", right: side === "creator" ? "auto" : "24%" }}
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
            size={140}
          />
          <SheetFighter
            fighterClass={winnerDescriptor.fighterClass}
            state="victory"
            facing="left"
            size={185}
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
