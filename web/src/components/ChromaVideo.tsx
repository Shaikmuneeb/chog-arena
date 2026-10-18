"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Chroma-keyed video: draws a muted looping <video> onto a <canvas> every
 * frame and zeroes the alpha of pixels matching the dark-gray studio
 * background, with smooth edge feathering. Only the character body renders.
 */
export function ChromaVideo({
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
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const draw = () => {
      if (video.readyState >= 2 && video.videoWidth > 0) {
        if (
          canvas.width !== video.videoWidth ||
          canvas.height !== video.videoHeight
        ) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = frame.data;

        // Sample the studio background color from the four corners.
        const idx = (x: number, y: number) => (y * canvas.width + x) * 4;
        const corners = [
          idx(0, 0),
          idx(canvas.width - 1, 0),
          idx(0, canvas.height - 1),
          idx(canvas.width - 1, canvas.height - 1),
        ];
        let r0 = 0;
        let g0 = 0;
        let b0 = 0;
        for (const c of corners) {
          r0 += data[c];
          g0 += data[c + 1];
          b0 += data[c + 2];
        }
        r0 = Math.round(r0 / corners.length);
        g0 = Math.round(g0 / corners.length);
        b0 = Math.round(b0 / corners.length);

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const sat = max - min;
          const dr = r - r0;
          const dg = g - g0;
          const db = b - b0;
          const colorDist = Math.sqrt(dr * dr + dg * dg + db * db);

          // Low saturation (gray) and close to the sampled background color.
          if (sat < 45 && colorDist < 90) {
            const t = Math.min(1, colorDist / 90);
            const smooth = t * t * (3 - 2 * t);
            data[i + 3] = Math.round(255 * smooth);
          }
        }
        ctx.putImageData(frame, 0, 0);
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
        className="h-full w-full object-contain"
        style={size ? { height: size, width: "auto" } : undefined}
      />
    </div>
  );
}