"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Sparkles } from "lucide-react";
import { pushToast } from "./Toast";

/** sessionStorage key — the gate only has to be passed once per session. */
export const VIBE_CHECK_KEY = "cwo-vibe-check";

type Stage = "calibration" | "question" | "passed";

type Question = {
  prompt: string;
  options: string[];
};

const QUESTIONS: Question[] = [
  {
    prompt: "Did Benja and James kiss?",
    options: [
      "Yes, they are gay",
      "Yes, with the full spiky purple armor still on",
      "No, they were just transferring MON mouth-to-mouth",
    ],
  },
  {
    prompt: "Do you like Chog Princess?",
    options: [
      "Yes, I would let her roundhouse kick me and drain my entire wallet",
      "I am only here for the 3D physics, respectfully",
      "No, I only simp for big sweaty armored men like Void Lord James",
    ],
  },
  {
    prompt: "Why did Benja touch Toad?",
    options: [
      "Cause he cant touch mamio",
      "Benja need a gay builder thats why",
      "But toad liks chog princesss",
    ],
  },
];

/** True when this session has already passed the vibe check. */
export function vibeCheckPassed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(VIBE_CHECK_KEY) === "passed";
  } catch {
    return false;
  }
}

/**
 * The CWO Vibe Check — a full-screen entry gate in front of the arena.
 *
 * Step 0 is a calibration meter, then three questions, then a very short
 * IQ certificate. The answers are not graded; the point is the bit.
 *
 * Rendered on its own route (`/vibe-check`) so visitors never see the
 * arena before clearing the screening.
 */
export function VibeCheckGate({ onPass }: { onPass: () => void }) {
  const [stage, setStage] = useState<Stage>("calibration");
  const [meter, setMeter] = useState(5);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);

  /* Keep the callback in a ref: the parent re-renders often, and a changing
   * `onPass` identity would keep resetting the certificate timer. */
  const onPassRef = useRef(onPass);
  onPassRef.current = onPass;

  const finish = useCallback(() => {
    try {
      window.sessionStorage.setItem(VIBE_CHECK_KEY, "passed");
    } catch {
      /* private mode — the gate just reappears next reload */
    }
    setStage("passed");
  }, []);

  /* The certificate holds for a few seconds so the "admire Chog Princess"
   * button can actually be clicked — the button proceeds immediately. */
  useEffect(() => {
    if (stage !== "passed") return;
    const t = setTimeout(() => onPassRef.current(), 8000);
    return () => clearTimeout(t);
  }, [stage]);

  const onBenjaToggle = () => {
    setMeter(10);
    pushToast({
      kind: "success",
      message: "BASED OVERFLOW — meter maxed. Based.",
    });
  };

  return (
    <div className="relative flex min-h-[100dvh] w-full items-center justify-center overflow-hidden bg-zinc-950 p-4 sm:p-8">
      {/* full-screen neon backdrop */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 15% 0%, rgba(217,70,239,0.30), transparent 55%), radial-gradient(ellipse at 90% 100%, rgba(34,211,238,0.24), transparent 55%), linear-gradient(180deg, #0b0616 0%, #12081f 55%, #05030c 100%)",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(192,132,252,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(192,132,252,0.7) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
        aria-hidden
      />

      <div className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-fuchsia-500/30 bg-zinc-950/80 p-6 shadow-[0_0_80px_-20px_rgba(217,70,239,0.45)] backdrop-blur-sm sm:p-10">
        {stage === "calibration" && (
          <>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-fuchsia-300/80">
              CWO Arena // Entry Screening
            </p>
            <h2 className="mt-2 bg-gradient-to-r from-fuchsia-300 via-pink-300 to-cyan-300 bg-clip-text text-3xl font-black uppercase tracking-tight text-transparent drop-shadow-[0_0_24px_rgba(217,70,239,0.5)] sm:text-4xl">
              Vibe Check
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              Calibrate your liquid degen coefficient before the arena lets you
              stake real MON.
            </p>

            {/* ---- calibration slider ---- */}
            <div className="mt-7 rounded-2xl border border-fuchsia-500/25 bg-black/50 p-5">
              <label
                htmlFor="cwo-gay-meter"
                className="text-xs font-black uppercase tracking-[0.2em] text-fuchsia-200"
              >
                How gay are you? (1 = Corporate Normie, 10 = Max Liquid Degen)
              </label>
              <div className="mt-4 flex items-center gap-4">
                <span className="w-8 text-right font-mono text-2xl font-black tabular-nums text-cyan-300 drop-shadow-[0_0_14px_rgba(34,211,238,0.6)]">
                  {meter}
                </span>
                <input
                  id="cwo-gay-meter"
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={meter}
                  onChange={(e) => setMeter(Number(e.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-pink-400 accent-fuchsia-400"
                />
                <span className="w-8 font-mono text-2xl font-black tabular-nums text-fuchsia-300 drop-shadow-[0_0_14px_rgba(217,70,239,0.6)]">
                  10
                </span>
              </div>
              <div className="mt-2 flex justify-between text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                <span>Corporate Normie</span>
                <span>Max Liquid Degen</span>
              </div>
            </div>

            {/* ---- the Benja toggle ---- */}
            <button
              type="button"
              onClick={onBenjaToggle}
              className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-pink-500/30 bg-pink-500/5 px-5 py-4 text-left transition hover:border-pink-400/60 hover:bg-pink-500/10"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 border-pink-400/70 text-pink-300">
                {meter === 10 && <Check className="h-4 w-4" aria-hidden />}
              </span>
              <span className="text-sm font-bold text-pink-100">
                Benja is a lesbian
              </span>
              <span className="ml-auto text-[10px] font-black uppercase tracking-widest text-pink-300/70">
                {meter === 10 ? "BASED" : "CLICK ME"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStage("question")}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-600 via-pink-600 to-rose-600 px-6 py-4 text-sm font-black uppercase tracking-[0.2em] text-white shadow-[0_0_32px_-6px_rgba(217,70,239,0.8)] transition hover:from-fuchsia-500 hover:via-pink-500 hover:to-rose-500 sm:w-auto"
            >
              Proceed to Vibe Check
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </>
        )}

        {stage === "question" && (
          <>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-fuchsia-300/80">
              Question {questionIndex + 1} / {QUESTIONS.length}
            </p>
            <h2 className="mt-2 text-2xl font-black uppercase tracking-tight text-white drop-shadow-[0_0_18px_rgba(217,70,239,0.45)] sm:text-3xl">
              {QUESTIONS[questionIndex].prompt}
            </h2>

            <div className="mt-6 space-y-3">
              {QUESTIONS[questionIndex].options.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    const next = [...answers, option];
                    setAnswers(next);
                    if (questionIndex + 1 >= QUESTIONS.length) {
                      finish();
                    } else {
                      setQuestionIndex((i) => i + 1);
                    }
                  }}
                  className="group flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-left text-sm font-semibold text-zinc-200 transition hover:border-fuchsia-400/60 hover:bg-fuchsia-500/10 hover:text-white"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-fuchsia-400/40 text-[10px] font-black text-fuchsia-300 group-hover:bg-fuchsia-500/20">
                    {String.fromCharCode(65 + questionIndex)}
                  </span>
                  {option}
                </button>
              ))}
            </div>
          </>
        )}

        {stage === "passed" && (
          <div className="flex flex-col items-center py-6 text-center">
            <Sparkles className="h-10 w-10 animate-pulse text-cyan-300 drop-shadow-[0_0_20px_rgba(34,211,238,0.8)]" aria-hidden />
            <h2 className="mt-4 max-w-xl bg-gradient-to-r from-cyan-300 via-fuchsia-300 to-pink-300 bg-clip-text text-2xl font-black uppercase leading-tight tracking-tight text-transparent drop-shadow-[0_0_28px_rgba(217,70,239,0.6)] sm:text-4xl">
              You will be chugged by Benja
            </h2>
            <p className="mt-3 font-mono text-sm font-black uppercase tracking-[0.3em] text-fuchsia-200">
              IQ Verified: 12
            </p>
            <p className="mt-3 text-xs text-zinc-500">
              Calibration {meter}/10 · {answers.length}/3 answered
            </p>
            <button
              type="button"
              onClick={() => onPassRef.current()}
              className="mt-6 w-full rounded-2xl bg-gradient-to-r from-fuchsia-600 via-pink-600 to-rose-600 px-6 py-4 text-sm font-black uppercase tracking-[0.15em] text-white shadow-[0_0_36px_-6px_rgba(217,70,239,0.9)] transition hover:from-fuchsia-500 hover:via-pink-500 hover:to-rose-500"
            >
              Click here to admire Chog Princess
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
