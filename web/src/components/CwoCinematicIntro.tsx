"use client";

import { useEffect, useRef } from "react";
import {
  CWO_ASPECT,
  CWO_FLIP,
  CWO_GLYPHS,
  CWO_MASK_URL,
  CWO_VIEWBOX,
} from "@/config/cwoLockup";

/**
 * The CWO cinematic intro.
 *
 * A full-screen takeover that plays when the visitor hits "CLICK HERE TO
 * ADMIRE CHOG PRINCESS" on the vibe check. It is the same "CWO" lettering
 * the 3D arena extrudes on the stage — the letterforms come straight from
 * the arena's helvetiker typeface, converted to vector paths so the intro
 * plates can be masked INSIDE the letters.
 *
 * The sequence:
 *   phase 1  0 - 800ms    dark fade in with a low ambient glow
 *   phase 2  800 - 3500ms the letters lock centre-screen: sharp scale-down
 *                          with a lens flare sweeping across
 *   phase 3  3500ms +     the 15 plates cycle inside the letterforms on a
 *                          high-speed flip/slide
 *   phase 4  last 400ms   a flash and a zoom straight into the lobby
 *
 * Everything runs off ONE requestAnimationFrame loop — no timers to leak,
 * nothing to clean up but the frame itself, so it can never lock up or
 * leave a stray timeout behind on a slow device.
 */

/** The 15 plates that ride inside the letterforms. */
const FRAMES: readonly string[] = Array.from(
  { length: 15 },
  (_, i) => `/cwo-intro/cwo-intro-${i + 1}.png`,
);

/* ---------------- the timeline (ms) ---------------- */

/** Phase 1 — the dark fade-in. */
const T_FADE = 800;
/** Phase 2 — the letters lock in. */
const T_LOCK_IN = 800;
const T_LOCK_SET = 1500;
/** Phase 3 — the plates start cycling inside the letters. */
const T_CYCLE = 3500;
/** Phase 4 — the flash + zoom. */
const T_FLASH = 6700;
const T_END = 7100;
/** How long a plate holds before it flips to the next. */
const FRAME_MS = 175;

/** The chrome ramp used for the metallic letterform fill. */
const METAL_FILL =
  "linear-gradient(180deg, #ffffff 0%, #e6e2f2 12%, #8a83a6 26%, #f6f3ff 38%, " +
  "#4a4368 52%, #cfc9e4 66%, #6b6389 78%, #efeaf8 90%, #ffffff 100%)";

const easeOutQuart = (p: number) => 1 - Math.pow(1 - p, 4);
const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const easeOutQuad = (p: number) => 1 - Math.pow(1 - p, 2);

export function CwoCinematicIntro({
  onComplete,
  onFinished,
}: {
  /** Fired when the final flash starts — start the route change here so the
   *  lobby is mounted underneath the flash. */
  onComplete: () => void;
  /** Fired when the sequence is over and the overlay can be dropped. */
  onFinished?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const lockRef = useRef<HTMLDivElement>(null);
  const metalRef = useRef<HTMLDivElement>(null);
  const layerARef = useRef<HTMLImageElement>(null);
  const layerBRef = useRef<HTMLImageElement>(null);
  const flareRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);

  /* keep the callbacks in refs: the sequence must never restart because
   * the parent re-rendered with a new function identity */
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;

  useEffect(() => {
    /* Warm every plate up front: the cycle must never flash a blank. */
    for (const src of FRAMES) {
      const img = new Image();
      img.decoding = "async";
      img.src = src;
    }

    let raf = 0;
    let start = 0;
    let frameIndex = 0;
    let nextFrameAt = T_CYCLE;
    let frontIdx = 0;
    let animFrom: HTMLImageElement | null = null;
    let animTo: HTMLImageElement | null = null;
    let animT0 = 0;
    let completed = false;

    const layers = [layerARef, layerBRef];

    /* the first plate is already on screen (hidden until the handover) */
    const first = layers[0].current;
    if (first) {
      first.src = FRAMES[0];
      first.style.opacity = "0";
      first.style.transform = "translate3d(0,0,0) scale(1)";
    }
    const second = layers[1].current;
    if (second) {
      second.style.opacity = "0";
      second.style.transform = "translate3d(9%,0,0) scale(1.07)";
    }

    const tick = (now: number) => {
      if (!start) start = now;
      const t = now - start;

      /* ---------- phase 1: dark fade-in + ambient glow ---------- */
      const fade = Math.min(1, t / T_FADE);
      if (glowRef.current) {
        glowRef.current.style.opacity = String(0.18 + 0.82 * fade * fade);
      }

      /* ---------- phase 2: the letters lock centre-screen ---------- */
      if (t >= T_LOCK_IN) {
        const p = Math.min(1, (t - T_LOCK_IN) / (T_LOCK_SET - T_LOCK_IN));
        const e = easeOutQuart(p);
        if (lockRef.current) {
          lockRef.current.style.opacity = String(Math.min(1, e * 1.7));
          lockRef.current.style.transform = `scale(${(1.55 - 0.55 * e).toFixed(4)})`;
        }
        /* the lens flare sweeps across as the letters settle */
        if (flareRef.current) {
          const f = Math.min(1, (t - T_LOCK_IN) / 760);
          const flare = Math.sin(f * Math.PI);
          flareRef.current.style.opacity = String(flare * 0.9);
          flareRef.current.style.transform =
            `translate3d(${(-50 + 100 * f).toFixed(1)}%, -50%, 0) ` +
            `scaleX(${(0.35 + 1.9 * flare).toFixed(3)})`;
        }
      }

      /* ---------- phase 3: the plates cycle inside the letters ---------- */
      /* the chrome fill hands over to the plates */
      const plateAlpha = Math.min(1, Math.max(0, (t - (T_CYCLE - 240)) / 300));
      if (metalRef.current) {
        metalRef.current.style.opacity = String(1 - plateAlpha);
      }
      if (t >= nextFrameAt) {
        const outEl = layers[frontIdx].current;
        const inEl = layers[1 - frontIdx].current;
        if (outEl && inEl) {
          frameIndex = (frameIndex + 1) % FRAMES.length;
          inEl.src = FRAMES[frameIndex];
          inEl.style.opacity = "0";
          inEl.style.transform = "translate3d(9%,0,0) scale(1.07)";
          outEl.style.opacity = "1";
          outEl.style.transform = "translate3d(0,0,0) scale(1)";
          animFrom = outEl;
          animTo = inEl;
          animT0 = t;
          frontIdx = 1 - frontIdx;
        }
        nextFrameAt = t + FRAME_MS;
      }
      if (animFrom && animTo) {
        const p = Math.min(1, (t - animT0) / FRAME_MS);
        const e = easeOutCubic(p);
        animTo.style.opacity = String(e * plateAlpha);
        animTo.style.transform =
          `translate3d(${(9 * (1 - e)).toFixed(2)}%,0,0) ` +
          `scale(${(1.07 - 0.07 * e).toFixed(4)})`;
        animFrom.style.opacity = String((1 - e) * plateAlpha);
        animFrom.style.transform =
          `translate3d(${(-9 * e).toFixed(2)}%,0,0) ` +
          `scale(${(1 + 0.07 * e).toFixed(4)})`;
        if (p >= 1) {
          animFrom = null;
          animTo = null;
        }
      } else {
        /* at rest the visible plate simply follows the handover */
        const frontEl = layers[frontIdx].current;
        if (frontEl) frontEl.style.opacity = String(plateAlpha);
      }

      /* ---------- phase 4: flash + zoom into the lobby ---------- */
      if (t >= T_FLASH) {
        const p = Math.min(1, (t - T_FLASH) / (T_END - T_FLASH));
        const e = easeOutQuad(p);
        if (lockRef.current) {
          lockRef.current.style.transform = `scale(${(1 + 2.6 * e).toFixed(4)})`;
          lockRef.current.style.opacity = String(1 - e * 0.5);
        }
        if (flashRef.current) {
          flashRef.current.style.opacity = String(Math.min(1, e * 2.2));
          flashRef.current.style.transform = `scale(${(0.15 + 1.45 * e).toFixed(4)})`;
        }
        if (veilRef.current) {
          veilRef.current.style.opacity = String(Math.min(0.42, e * 0.6));
        }
        if (!completed && t >= T_FLASH + 200) {
          completed = true;
          /* the lobby is mounted underneath the flash from here on */
          completeRef.current?.();
        }
      }

      /* Safety net: if the route change never lands, the white veil fades
       * out so the visitor is never stranded on a white screen. */
      if (t >= T_END + 2000 && veilRef.current) {
        const p = Math.min(1, (t - (T_END + 2000)) / 320);
        veilRef.current.style.opacity = String(0.94 * (1 - p));
        if (p >= 1) {
          finishedRef.current?.();
          return; /* the sequence is over */
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-50 overflow-hidden bg-black"
      style={{ willChange: "transform, opacity" }}
      aria-hidden
    >
      {/* ---- phase 1: the low ambient glow ---- */}
      <div
        ref={glowRef}
        className="absolute inset-0"
        style={{
          opacity: 0,
          background:
            "radial-gradient(ellipse 62% 48% at 50% 52%, rgba(168,85,247,0.30) 0%, " +
            "rgba(236,72,153,0.16) 38%, rgba(5,3,12,0) 72%)",
        }}
      />

      {/* ---- the letter lockup ---- */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          ref={lockRef}
          className="relative w-[min(86vw,1240px)]"
          style={{
            aspectRatio: String(CWO_ASPECT),
            opacity: 0,
            transform: "scale(1.55)",
            willChange: "transform, opacity",
          }}
        >
          {/* the plates + the chrome fill, masked into the letter shapes */}
          <div
            className="absolute inset-0"
            style={{
              maskImage: `url(${CWO_MASK_URL})`,
              WebkitMaskImage: `url(${CWO_MASK_URL})`,
              maskSize: "100% 100%",
              WebkitMaskSize: "100% 100%",
              maskRepeat: "no-repeat",
              WebkitMaskRepeat: "no-repeat",
              maskMode: "alpha",
            }}
          >
            {/* metallic letterform fill */}
            <div
              ref={metalRef}
              className="cwo-metal absolute inset-0"
              style={{ background: METAL_FILL }}
            />
            {/* the cycling plates */}
            <img
              ref={layerARef}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              style={{
                willChange: "transform, opacity",
                filter: "saturate(1.35) brightness(1.45) contrast(1.08)",
              }}
            />
            <img
              ref={layerBRef}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              style={{
                willChange: "transform, opacity",
                filter: "saturate(1.35) brightness(1.45) contrast(1.08)",
              }}
            />
          </div>

          {/* the neon outline over the top of the plates */}
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={`${CWO_VIEWBOX.minX} ${CWO_VIEWBOX.minY} ${CWO_VIEWBOX.width} ${CWO_VIEWBOX.height}`}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="cwo-neon" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ff2fb9" />
                <stop offset="45%" stopColor="#c026d3" />
                <stop offset="100%" stopColor="#22d3ee" />
              </linearGradient>
              <filter id="cwo-glow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="10" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <g
              transform={CWO_FLIP}
              fill="none"
              stroke="url(#cwo-neon)"
              strokeWidth={12}
              strokeLinejoin="round"
              filter="url(#cwo-glow)"
            >
              {CWO_GLYPHS.map((g) => (
                <path key={g.ch} d={g.d} transform={`translate(${g.x} 0)`} />
              ))}
            </g>
          </svg>
        </div>
      </div>

      {/* ---- phase 2: the lens flare ---- */}
      <div
        ref={flareRef}
        className="pointer-events-none absolute left-0 top-1/2 h-[3px] w-[130vw] origin-center"
        style={{
          opacity: 0,
          transform: "translate3d(-50%,-50%,0) scaleX(0.35)",
          background:
            "linear-gradient(90deg, rgba(255,47,185,0) 0%, rgba(255,255,255,0.9) 42%, " +
            "rgba(34,211,238,0.85) 52%, rgba(255,47,185,0) 100%)",
          filter: "blur(1px)",
          willChange: "transform, opacity",
        }}
      />

      {/* ---- phase 4: the flash ---- */}
      <div
        ref={flashRef}
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: 0,
          transform: "scale(0.15)",
          background:
            "radial-gradient(circle at 50% 50%, #ffffff 0%, #ffffff 16%, " +
            "rgba(255,214,245,0.9) 34%, rgba(255,47,185,0.65) 52%, " +
            "rgba(168,85,247,0.28) 68%, rgba(255,47,185,0) 80%)",
          willChange: "transform, opacity",
        }}
      />
      <div
        ref={veilRef}
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: 0,
          background: "radial-gradient(circle at 50% 50%, #ffffff 0%, #ffe6f7 55%, #ffc9ee 100%)",
          willChange: "opacity",
        }}
      />
    </div>
  );
}
