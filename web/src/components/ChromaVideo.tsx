"use client";

import { memo, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const PROCESS_W = 240;
const PROCESS_H = 240;
const FRAME_INTERVAL = 33;

/**
 * Chroma-keyed video: draws a muted looping <video> onto a small canvas and
 * zeroes the alpha of pixels matching the dark-gray studio background.
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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = PROCESS_W;
    canvas.height = PROCESS_H;

    let raf = 0;
    let lastFrameTime = 0;

    const draw = (timestamp: number) => {
      if (timestamp - lastFrameTime >= FRAME_INTERVAL) {
        lastFrameTime = timestamp;
        if (video.readyState >= 2 && video.videoWidth > 0) {
          ctx.drawImage(video, 0, 0, PROCESS_W, PROCESS_H);
          const frame = ctx.getImageData(0, 0, PROCESS_W, PROCESS_H);
          const data = frame.data;

          // Sample the studio background color from the top-left corner.
          const bgR = data[0];
          const bgG = data[1];
          const bgB = data[2];

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            const dr = r - bgR;
            const dg = g - bgG;
            const db = b - bgB;
            const dist = Math.sqrt(dr * dr + dg * dg + db * db);
            const sat = Math.max(r, g, b) - Math.min(r, g, b);

            if (dist < 26 && sat < 14) {
              data[i + 3] = 0;
            } else if (b - g > 12 || r - g > 12) {
              data[i + 3] = 255;
            }
          }
          ctx.putImageData(frame, 0, 0);
        }
        // If readyState < 2, keep the previous frame (do not clear).
      }
      raf = requestAnimationFrame(draw);
    };

    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    void video.play().catch(() => {});
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [src]);

  return (
    <div className={cn("relative inline-block", className)} style={style}>
      <video
        ref={videoRef}
        src={src}
        muted
        loop
        playsInline
        autoPlay
        className="hidden"
      />
      <canvas
        ref={canvasRef}
        className="w-full h-full object-contain"
        style={size ? { height: size, width: "auto" } : undefined}
      />
    </div>
  );
});