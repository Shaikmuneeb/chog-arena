"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CwoCinematicIntro } from "@/components/CwoCinematicIntro";
import { VibeCheckGate, vibeCheckPassed } from "@/components/VibeCheckGate";

/**
 * The screens the screening route moves through.
 *
 *   quiz       the starting quiz — the calibration meter and the three
 *              questions
 *   cwo_intro  the CWO cinematic takeover, explicitly fired the moment the
 *              visitor clicks the admire button
 *   lobby      the Main Lobby, reached by the route change below
 *
 * The machine is explicit so the cinematic always plays BETWEEN the quiz
 * and the lobby: it is a state, not a side effect, and it can never be
 * skipped by a stray navigation.
 */
type View = "quiz" | "cwo_intro" | "lobby";

/**
 * The CWO Vibe Check screening route.
 *
 * Visitors land here first and see nothing but the calibration meter and
 * the three questions. Clearing it stores the result in sessionStorage and
 * bounces back to the arena dashboard.
 */
export default function VibeCheckPage() {
  const router = useRouter();
  const [view, setView] = useState<View>("quiz");

  /* already cleared this session — don't make them sit through it again */
  useEffect(() => {
    if (vibeCheckPassed()) {
      setView("lobby");
      router.replace("/");
      return;
    }
    setView("quiz");
  }, [router]);

  /* Warm the arena route now so the cinematic's final flash can hand the
   * visitor straight over to a lobby that is already in memory. */
  useEffect(() => {
    router.prefetch("/");
  }, [router]);

  /** The quiz is done — fire the cinematic before the lobby. */
  const startIntro = useCallback(() => {
    setView("cwo_intro");
  }, []);

  /**
   * Hand over to the Main Lobby.
   *
   * The cinematic keeps rendering until the route actually swaps, so the
   * final flash is never cut short.
   */
  const enterLobby = useCallback(() => {
    router.replace("/");
  }, [router]);

  return (
    <>
      {view === "quiz" && (
        <VibeCheckGate
          onPass={enterLobby}
          onStartIntro={startIntro}
        />
      )}
      {view === "cwo_intro" && (
        <CwoCinematicIntro
          onComplete={enterLobby}
          onFinished={enterLobby}
        />
      )}
    </>
  );
}
