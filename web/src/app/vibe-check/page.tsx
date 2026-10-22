"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { VibeCheckGate, vibeCheckPassed } from "@/components/VibeCheckGate";

/**
 * The CWO Vibe Check screening route.
 *
 * Visitors land here first and see nothing but the calibration meter and
 * the three questions. Clearing it stores the result in sessionStorage and
 * bounces back to the arena dashboard.
 */
export default function VibeCheckPage() {
  const router = useRouter();
  /* the gate only mounts for a visitor who has NOT cleared it yet */
  const [showGate, setShowGate] = useState(false);

  /* already cleared this session — don't make them sit through it again */
  useEffect(() => {
    if (vibeCheckPassed()) {
      router.replace("/");
      return;
    }
    setShowGate(true);
  }, [router]);

  /* Warm the arena route now so the cinematic's final flash can hand the
   * visitor straight over to a lobby that is already in memory. */
  useEffect(() => {
    router.prefetch("/");
  }, [router]);

  if (!showGate) {
    /* A visitor who already cleared the screening is on their way to the
     * lobby - mounting the gate would kick the theme off at full energy
     * for a screen they are about to leave. */
    return <div className="min-h-[100dvh] w-full bg-black" />;
  }

  return (
    <VibeCheckGate
      onPass={() => router.replace("/")}
    />
  );
}
