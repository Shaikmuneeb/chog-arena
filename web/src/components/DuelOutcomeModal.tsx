"use client";

import { useEffect, useState } from "react";
import { cn, formatMon } from "@/lib/utils";

export type DuelOutcome = {
  duelId: number;
  userWon: boolean;
  secondWind: boolean;
  userResurrected: boolean;
  wager: bigint;
};

type DuelOutcomeModalProps = {
  outcome: DuelOutcome | null;
  onClose: () => void;
};

/**
 * Victory/defeat settlement screen. When Second Wind fired, the animated
 * resurrection banner plays first, then the final result is revealed.
 */
export function DuelOutcomeModal({ outcome, onClose }: DuelOutcomeModalProps) {
  const [phase, setPhase] = useState<"resurrect" | "final">("final");

  useEffect(() => {
    if (!outcome) return;
    if (outcome.secondWind) {
      setPhase("resurrect");
      const timer = setTimeout(() => setPhase("final"), 2600);
      return () => clearTimeout(timer);
    }
    setPhase("final");
  }, [outcome]);

  if (!outcome) return null;

  const showResurrect = outcome.secondWind && phase === "resurrect";

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl shadow-black/60 animate-pop-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {showResurrect ? (
          /* ---- Resurrection banner (plays before the final result) ---- */
          <div className="animate-second-wind bg-gradient-to-b from-rose-950 via-red-950 to-zinc-900 px-6 py-14 text-center">
            <p className="text-6xl animate-pulse">🛡️</p>
            <h3 className="mt-4 bg-gradient-to-r from-rose-200 via-orange-200 to-rose-200 bg-clip-text text-2xl font-extrabold tracking-wide text-transparent">
              SECOND WIND ACTIVATED!
            </h3>
            <p className="mt-2 text-sm font-semibold text-rose-200/90">
              Sudden death re-roll triggered!
            </p>
            <div className="mx-auto mt-5 h-1 w-40 overflow-hidden rounded-full bg-black/50">
              <div className="h-full w-full origin-left bg-gradient-to-r from-rose-500 to-orange-400 animate-shimmer" />
            </div>
          </div>
        ) : (
          /* ---- Final result ---- */
          <div
            className={cn(
              "px-6 py-10 text-center",
              outcome.userWon
                ? "bg-gradient-to-b from-emerald-950/80 via-zinc-900 to-zinc-900"
                : "bg-gradient-to-b from-zinc-800 via-zinc-900 to-zinc-900",
            )}
          >
            <p className="text-6xl animate-pop-in">
              {outcome.userWon ? "🏆" : "💀"}
            </p>
            <h3
              className={cn(
                "mt-4 text-3xl font-extrabold tracking-wide",
                outcome.userWon ? "text-emerald-300" : "text-zinc-400",
              )}
            >
              {outcome.userWon ? "VICTORY" : "DEFEAT"}
            </h3>
            <p className="mt-2 text-sm text-zinc-400">
              {outcome.userWon ? (
                <>
                  You claimed{" "}
                  <span className="font-semibold text-emerald-300">
                    {formatMon(outcome.wager * 2n)} MON
                  </span>{" "}
                  from Duel #{outcome.duelId}
                </>
              ) : (
                <>
                  You lost{" "}
                  <span className="font-semibold text-zinc-300">
                    {formatMon(outcome.wager)} MON
                  </span>{" "}
                  in Duel #{outcome.duelId}
                </>
              )}
            </p>
            {outcome.userResurrected && (
              <p className="mt-3 text-xs text-rose-300/90">
                Your Second Wind resurrection was consumed this duel.
              </p>
            )}
            <button
              type="button"
              onClick={onClose}
              className="mt-6 rounded-xl bg-white/10 px-6 py-2.5 text-sm font-semibold text-zinc-100 transition hover:bg-white/15"
            >
              Back to the lobby
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
