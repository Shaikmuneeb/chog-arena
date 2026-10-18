"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";

export type FighterPose = "stance" | "attack" | "guard";

const FRAME_INDEX: Record<FighterPose, number> = {
  stance: 0,
  attack: 1,
  guard: 2,
};

/**
 * Lightweight static sprite renderer: shows one frame of a 4-frame sprite
 * sheet via CSS background positioning. No video/canvas decoding.
 */
export const ChromaVideo = memo(function ChromaVideo({
  src,
  pose = "stance",
  className,
  style,
  size,
}: {
  src: string;
  pose?: FighterPose;
  className?: string;
  style?: React.CSSProperties;
  size?: number;
}) {
  const frame = FRAME_INDEX[pose] ?? 0;
  const pos = `${(frame / 3) * 100}% 0%`;
  return (
    <div
      className={cn("inline-block bg-transparent", className)}
      style={{
        height: size,
        width: size ? size * 0.72 : undefined,
        backgroundImage: `url(${src})`,
        backgroundSize: "400% 100%",
        backgroundPosition: pos,
        backgroundRepeat: "no-repeat",
        imageRendering: "pixelated",
        ...style,
      }}
    />
  );
});