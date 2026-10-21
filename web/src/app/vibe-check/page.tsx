"use client";

import { useEffect } from "react";
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

  /* already cleared this session — don't make them sit through it again */
  useEffect(() => {
    if (vibeCheckPassed()) router.replace("/");
  }, [router]);

  return (
    <VibeCheckGate
      onPass={() => router.replace("/")}
    />
  );
}
