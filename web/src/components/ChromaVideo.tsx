"use client";

import { memo, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type FighterPose = "stance" | "attack" | "guard";

type PoseSet = { stance: string; attack: string; guard: string };

const FRAME_CACHE = new Map<string, PoseSet>();

const POSE_TIMES: Record<FighterPose, number> = {
  stance: 0.05,
  attack: 0.35,
  guard: 0.85,
};

function chromaKey(data: Uint8ClampedArray) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    if (sat < 15 && r < 65) {
      data[i + 3] = 0;
    }
  }
}

/**
 * Extracts 3 transparent PNG poses from the MP4 turntable and renders the
 * selected pose. No video decoding happens during combat.
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
  const [poses, setPoses] = useState<PoseSet | null>(FRAME_CACHE.get(src) ?? null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (FRAME_CACHE.has(src)) {
      setPoses(FRAME_CACHE.get(src)!);
      return;
    }
    const video = document.createElement("video");
    video.src = src;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.style.position = "fixed";
    video.style.left = "-9999px";
    video.style.top = "-9999px";
    document.body.appendChild(video);
    videoRef.current = video;

    const poseset: Partial<PoseSet> = {};
    const order: FighterPose[] = ["stance", "attack", "guard"];
    let idx = 0;

    const extractCurrent = () => {
      if (video.readyState < 2) return;
      const w = video.videoWidth || 320;
      const h = video.videoHeight || 320;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);
      const frame = ctx.getImageData(0, 0, w, h);
      chromaKey(frame.data);
      ctx.putImageData(frame, 0, 0);
      const url = canvas.toDataURL("image/png");
      const p = order[idx];
      poseset[p] = url;
      idx += 1;
      if (idx < order.length) {
        try {
          video.currentTime = POSE_TIMES[order[idx]];
        } catch {
          // fallback
        }
      } else {
        const full: PoseSet = {
          stance: poseset.stance!,
          attack: poseset.attack!,
          guard: poseset.guard!,
        };
        FRAME_CACHE.set(src, full);
        setPoses(full);
        video.pause();
        video.removeAttribute("src");
        try {
          video.load();
        } catch {}
        if (video.parentNode) video.parentNode.removeChild(video);
      }
    };

    const onLoaded = () => {
      try {
        video.currentTime = POSE_TIMES.stance;
      } catch {
        extractCurrent();
      }
    };
    const onSeeked = () => extractCurrent();

    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("seeked", onSeeked);
    video.load();

    return () => {
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("seeked", onSeeked);
      video.pause();
      video.removeAttribute("src");
      if (video.parentNode) video.parentNode.removeChild(video);
    };
  }, [src]);

  const url = poses ? poses[pose] : null;

  if (!url) {
    return (
      <div
        className={cn("inline-block bg-transparent", className)}
        style={{ height: size, width: size ? size * 0.7 : undefined, ...style }}
      />
    );
  }

  return (
    <img
      src={url}
      alt=""
      className={cn("object-contain", className)}
      style={{ height: size, width: "auto", ...style }}
      draggable={false}
    />
  );
});