"use client";

import { memo, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const FRAME_CACHE = new Map<string, string>();

/**
 * Extracts a single front-facing frame from the MP4, chroma-keys the neutral
 * gray studio background, and renders a cached static PNG <img>. No video
 * decoding happens during combat.
 */
export const ChromaVideo = memo(function ChromaVideo({
  src,
  className,
  style,
  size,
}: {
  src: string;
  className?: string;
  style?: React.CSSProperties;
  size?: number;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(
    FRAME_CACHE.get(src) ?? null,
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (FRAME_CACHE.has(src)) {
      setDataUrl(FRAME_CACHE.get(src)!);
      return;
    }
    const video = document.createElement("video");
    video.src = src;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    videoRef.current = video;

    const extract = () => {
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
      const data = frame.data;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        if (sat < 15 && r < 65) {
          data[i + 3] = 0;
        }
      }
      ctx.putImageData(frame, 0, 0);
      const url = canvas.toDataURL("image/png");
      FRAME_CACHE.set(src, url);
      setDataUrl(url);
      video.pause();
      video.removeAttribute("src");
      video.load();
    };

    const onLoaded = () => {
      try {
        video.currentTime = 0.1;
      } catch {
        extract();
      }
    };
    const onSeeked = () => extract();

    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("seeked", onSeeked);
    video.load();

    return () => {
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("seeked", onSeeked);
      video.pause();
      video.removeAttribute("src");
    };
  }, [src]);

  if (!dataUrl) {
    return (
      <div
        className={cn("inline-block bg-transparent", className)}
        style={{ height: size, width: size ? size * 0.7 : undefined, ...style }}
      />
    );
  }

  return (
    <img
      src={dataUrl}
      alt=""
      className={cn("object-contain", className)}
      style={{ height: size, width: "auto", ...style }}
      draggable={false}
    />
  );
});