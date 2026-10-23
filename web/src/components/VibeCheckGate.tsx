"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Sparkles } from "lucide-react";
import { pushToast } from "./Toast";
import { preloadCwoFrames } from "./CwoCinematicIntro";
import { ThemeMuteButton } from "./ThemeMuteButton";
import { setChogScene } from "@/lib/chogTheme";

/** sessionStorage key — the gate only has to be passed once per session. */
export const VIBE_CHECK_KEY = "cwo-vibe-check";

type Stage = "calibration" | "question" | "passed";

type QuizOption = {
  text: string;
  /** The IQ points this answer is worth. */
  iq: number;
};

type Question = {
  prompt: string;
  options: QuizOption[];
};

/**
 * The screening questions.
 *
 * The answers are not graded — the point is the bit — but they DO add up to
 * the IQ on the certificate, so the visitor's own choices decide the number
 * they walk into the arena with. The middle option of each question is
 * worth 4, so a middling run still lands on the classic 12; the sharpest
 * run tops out at 18 and the laziest bottoms out at 8.
 */
const QUESTIONS: Question[] = [
  {
    prompt: "Did Benja and James kiss?",
    options: [
      { text: "Yes, they are gay", iq: 4 },
      {
        text: "Yes, with the full spiky purple armor still on",
        iq: 6,
      },
      { text: "No, they were just transferring MON mouth-to-mouth", iq: 3 },
    ],
  },
  {
    prompt: "Do you like Chog Princess?",
    options: [
      {
        text: "Yes, I would let her roundhouse kick me and drain my entire wallet",
        iq: 6,
      },
      { text: "I am only here for the 3D physics, respectfully", iq: 4 },
      {
        text: "No, I only simp for big sweaty armored men like Void Lord James",
        iq: 2,
      },
    ],
  },
  {
    prompt: "Why did Benja touch Toad?",
    options: [
      { text: "Cause he cant touch mamio", iq: 4 },
      { text: "Benja need a gay builder thats why", iq: 6 },
      { text: "But toad liks chog princesss", iq: 3 },
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
export function VibeCheckGate({
  onPass,
  onStartIntro,
}: {
  /** The screening is over and there is no cinematic — go straight in. */
  onPass: () => void;
  /** The visitor asked for the cinematic — fire the cwo_intro view. */
  onStartIntro: () => void;
}) {
  const [stage, setStage] = useState<Stage>("calibration");
  const [meter, setMeter] = useState(5);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<QuizOption[]>([]);

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

  /* Pull the cinematic frames down while the visitor is still reading the
   * gate — by the time they hit the button they are already cached, so the
   * final flash never waits on a 4.5MB download.
   *
   * The theme track comes down with them, and starts at full energy: the
   * quiz is the first screen of the session, so this is where the music
   * begins. Browsers that refuse to play before an interaction simply pick
   * it up on the visitor's first click. */
  useEffect(() => {
    preloadCwoFrames();
    setChogScene("quiz");
  }, []);

  /* The certificate holds for a few seconds so the "admire Chog" button
   * button can actually be clicked — the button proceeds immediately.
   * The cinematic takes over that hold, so the timer stands down while
   * it plays. */
  useEffect(() => {
    if (stage !== "passed") return;
    const t = setTimeout(() => onPassRef.current(), 8000);
    return () => clearTimeout(t);
  }, [stage]);

  const onMaxToggle = () => {
    setMeter(10);
    pushToast({
      kind: "success",
      message: "BASED OVERFLOW — meter maxed. Based.",
    });
  };

  /* The certificate is the sum of what the visitor actually answered. */
  const iqScore = answers.reduce((sum, answer) => sum + answer.iq, 0);

  return (
    <div className="relative flex min-h-[100dvh] w-full items-center justify-center overflow-hidden bg-black p-4 sm:p-8">
      {/* the theme toggle — the track starts with the cinematic, so the
          visitor gets a say before it does */}
      <div className="absolute right-4 top-4 z-10">
        <ThemeMuteButton />
      </div>

      {/* ambient bloom */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 15% -5%, rgba(168,85,247,0.30), transparent 55%), radial-gradient(ellipse at 90% 105%, rgba(236,72,153,0.26), transparent 55%), radial-gradient(ellipse at 60% 40%, rgba(34,211,238,0.12), transparent 60%)",
        }}
        aria-hidden
      />
      {/* technical grid */}
      <div
        className="pointer-events-none absolute inset-0 animate-grid-drift opacity-[0.16]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(192,132,252,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(192,132,252,0.7) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
        aria-hidden
      />

      <div className="glass-panel relative w-full max-w-3xl rounded-3xl border-fuchsia-500/30 p-6 shadow-[0_0_90px_-24px_rgba(217,70,239,0.75)] sm:p-10">
        {/* scanlines + corner brackets */}
        <div className="scanlines pointer-events-none absolute inset-0" aria-hidden />
        <div className="bracket-frame" aria-hidden />

        {stage === "calibration" && (
          <>
            <p className="stat-label text-fuchsia-300/80">
              CWO Arena // Entry Screening
            </p>
            <h2 className="neon-title mt-2 text-3xl font-bold uppercase leading-none tracking-tight drop-shadow-[0_0_24px_rgba(217,70,239,0.5)] sm:text-4xl">
              Vibe Check
            </h2>
            <p className="mt-3 font-display text-sm text-zinc-400">
              Calibrate your liquid degen coefficient before the arena lets you
              stake real MON.
            </p>

            {/* ---- calibration slider ---- */}
            <div className="glass-panel relative mt-7 p-5">
              <div
                className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-400/60 to-transparent"
                aria-hidden
              />
              <label
                htmlFor="cwo-degen-meter"
                className="stat-label !text-fuchsia-200/90"
              >
                How degen are you?
              </label>
              <div className="mt-4 flex items-center gap-4">
                <span className="stat-value w-8 text-right text-2xl font-bold text-cyan-300 drop-shadow-[0_0_14px_rgba(34,211,238,0.6)]">
                  {meter}
                </span>
                <input
                  id="cwo-degen-meter"
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={meter}
                  onChange={(e) => setMeter(Number(e.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-pink-400 accent-fuchsia-400"
                />
                <span className="stat-value w-8 text-2xl font-bold text-fuchsia-300 drop-shadow-[0_0_14px_rgba(217,70,239,0.6)]">
                  10
                </span>
              </div>
            </div>

            {/* ---- the max-out toggle ---- */}
            <button
              type="button"
              onClick={onMaxToggle}
              className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-pink-500/30 bg-pink-500/5 px-5 py-4 text-left backdrop-blur-md transition hover:border-pink-400/70 hover:bg-pink-500/10 hover:shadow-glow-pink"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 border-pink-400/70 text-pink-300">
                {meter === 10 && <Check className="h-4 w-4" aria-hidden />}
              </span>
              <span className="font-display text-sm font-bold text-pink-100">
                bigchog runs this arena
              </span>
              <span className="ml-auto font-display text-[10px] font-bold uppercase tracking-[0.18em] text-pink-300/70">
                {meter === 10 ? "BASED" : "CLICK ME"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStage("question")}
              className="btn-neon mt-6 w-full !py-4 sm:mx-auto sm:w-auto"
            >
              Proceed to Vibe Check
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </>
        )}

        {stage === "question" && (
          <>
            <p className="stat-label text-fuchsia-300/80">
              Question {questionIndex + 1} / {QUESTIONS.length}
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold uppercase leading-tight tracking-tight text-white drop-shadow-[0_0_18px_rgba(217,70,239,0.45)] sm:text-3xl">
              {QUESTIONS[questionIndex].prompt}
            </h2>

            <div className="mt-6 space-y-3">
              {QUESTIONS[questionIndex].options.map((option) => (
                <button
                  key={option.text}
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
                  className="group flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-left font-display text-sm font-semibold text-zinc-200 backdrop-blur-md transition hover:border-fuchsia-400/60 hover:bg-fuchsia-500/10 hover:text-white hover:shadow-glow-purple"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-fuchsia-400/40 font-mono text-[10px] font-bold text-fuchsia-300 group-hover:bg-fuchsia-500/20">
                    {String.fromCharCode(65 + questionIndex)}
                  </span>
                  {option.text}
                </button>
              ))}
            </div>
          </>
        )}

        {stage === "passed" && (
          <div className="flex flex-col items-center py-6 text-center">
            <Sparkles
              className="h-10 w-10 animate-pulse text-cyan-300 drop-shadow-[0_0_20px_rgba(34,211,238,0.8)]"
              aria-hidden
            />
            <h2 className="neon-title mt-4 max-w-xl text-2xl font-bold uppercase leading-tight tracking-tight drop-shadow-[0_0_28px_rgba(217,70,239,0.6)] sm:text-4xl">
              Congrats — The Arena Awaits
            </h2>
            <p className="stat-value mt-3 text-sm font-bold uppercase tracking-[0.3em] text-fuchsia-200">
              IQ Verified: {iqScore}
            </p>
            <p className="mt-3 font-mono text-xs text-zinc-500">
              Calibration {meter}/10 · {answers.length}/3 answered
            </p>
            <button
              type="button"
              onClick={onStartIntro}
              className="btn-neon mt-6 w-full !py-4 !text-xs"
            >
              Click here to admire Chog
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
