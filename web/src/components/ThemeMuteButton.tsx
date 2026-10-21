"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useChogTheme } from "@/hooks/useChogTheme";
import { toggleChogThemeMute } from "@/lib/chogTheme";
import { cn } from "@/lib/utils";

/**
 * The mute toggle for the Chog theme track.
 *
 * Two states, one button: the speaker is on, or the speaker is crossed out.
 * Muting does not stop the track - it keeps its place in the loop, so
 * unmuting brings the music straight back in without a restart.
 *
 * The choice is remembered, so a visitor who muted the theme stays muted
 * the next time the cinematic runs.
 */
export function ThemeMuteButton({ className }: { className?: string }) {
  const { muted } = useChogTheme();
  const label = muted ? "Unmute the Chog theme" : "Mute the Chog theme";

  return (
    <button
      type="button"
      onClick={() => toggleChogThemeMute()}
      title={label}
      aria-label={label}
      aria-pressed={muted}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-white/5 backdrop-blur-md transition",
        "hover:border-fuchsia-400/50 hover:bg-fuchsia-500/10",
        muted
          ? "border-white/10 text-zinc-500"
          : "border-cyan-300/25 text-cyan-300 shadow-glow-cyan",
        className,
      )}
    >
      {muted ? (
        <VolumeX className="h-4 w-4" aria-hidden />
      ) : (
        <Volume2 className="h-4 w-4" aria-hidden />
      )}
    </button>
  );
}
