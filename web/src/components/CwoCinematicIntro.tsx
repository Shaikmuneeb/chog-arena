"use client";

import { useEffect, useRef } from "react";
import {
  CWO_ASPECT,
  CWO_FLIP,
  CWO_GLYPHS,
  CWO_MASK_URL,
  CWO_VIEWBOX,
} from "@/config/cwoLockup";
import {
  AMBIENT_VOLUME,
  rampChogThemeTo,
  setChogScene,
} from "@/lib/chogTheme";

/**
 * The CWO cinematic intro.
 *
 * A full-screen takeover that plays when the visitor hits "CLICK HERE TO
 * ADMIRE CHOG PRINCESS" on the vibe check. It is the same "CWO" lettering
 * the 3D arena extrudes on the stage — the letterforms come straight from
 * the arena's helvetiker typeface, converted to vector paths so the intro
 * plates can be masked INSIDE the letters.
 *
 * The sequence — a five second movie intro:
 *   0 - 3500ms     the 19 plates flip through the letterforms on an even
 *                  184ms cadence, the logo locked dead-centre
 *   2000 - 5000ms  the MARVEL ZOOM: the logo accelerates straight at the
 *                  viewer, lens flares sweeping across it
 *   4600 - 5000ms  the flash peaks and cuts into the arena lobby
 *
 * Everything runs off ONE requestAnimationFrame loop — no timers to leak,
 * nothing to clean up but the frame itself, so it can never lock up or
 * leave a stray timeout behind on a slow device.
 */

/**
 * The plates that ride inside the letterforms.
 *
 * These are the real CWO intro frames, served straight out of the app's
 * public root — "cwo intro 1.jpeg" through "cwo intro 19.jpeg". Keep the
 * names in step with `scripts/sync-cwo-frames.mjs`, which copies them in
 * from the workspace and normalises the few that carry a stray space
 * before the extension.
 */
const FRAMES: readonly string[] = Array.from(
  { length: 19 },
  (_, i) => `/cwo intro ${i + 1}.jpeg`,
);

/**
 * Warm the frames in the HTTP cache.
 *
 * The set is ~4.5MB, so pulling it down while the visitor is still reading
 * the vibe check keeps it off the critical path — otherwise the frames
 * compete with the route change for bandwidth and the final flash stalls
 * waiting for the arena to mount. Low priority so it never fights a page
 * the visitor actually asked for.
 */
let framesWarmed = false;
export function preloadCwoFrames(): void {
  if (framesWarmed) return;
  framesWarmed = true;
  for (const src of FRAMES) {
    const img = new Image();
    img.decoding = "async";
    img.fetchPriority = "low";
    img.src = src;
  }
}

/* ---------------- the timeline (ms) ---------------- */

/** The whole sequence, cut to the arena lobby at the end. */
const T_TOTAL = 5000;
/** The plates take over the chrome fill. */
const T_MONTAGE_START = 150;
/** The last plate has landed — the montage is done. */
const T_MONTAGE_END = 3500;
/** The zoom takes over the final three seconds. */
const T_ZOOM_START = 2000;
/** The flash begins to bloom. */
const T_FLASH = 4600;
/**
 * The visual transition out of the intro: the flash swells to full white
 * and the overlay drops away into the lobby.
 *
 * The theme track rides the exact same span - it ramps from full energy
 * down to its ambient lobby level while the flash covers the cut, so the
 * music never jumps.
 */
const T_TRANSITION = T_TOTAL - T_FLASH;
/**
 * One plate per flip. The set is spread evenly across the montage window:
 * 18 flips of 194ms puts the last plate at 3492ms, so all 19 are on screen
 * before the zoom takes over.
 */
const FRAME_MS = Math.round(T_MONTAGE_END / (FRAMES.length - 1));

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
  const bloomRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);

  /* keep the callbacks in refs: the sequence must never restart because
   * the parent re-rendered with a new function identity */
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;

  useEffect(() => {
    /* the frames are usually already warm from the gate */
    preloadCwoFrames();

    /* The theme track: "we believe in chog" at full energy for the
     * sequence. The element is owned by the module, not by this component,
     * so it survives the route change into the lobby - the intro only ever
     * changes its level, never its place in the track. */
    setChogScene("intro");

    let raf = 0;
    let start = 0;
    let frameIndex = 0;
    /* has the music been handed over to its ambient level yet */
    let fading = false;
    /* has the sequence actually started running? React mounts an effect
     * twice in development, so the cleanup below runs once before the
     * first frame - that is not a teardown and must not touch the music */
    let running = false;
    /* the flip grid starts on the first beat: 18 flips of FRAME_MS put the
     * last plate at 3492ms, inside the montage window */
    let nextFrameAt = FRAME_MS;
    /** how many plates have been flipped in */
    let flips = 0;
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
      if (!start) {
        start = now;
        running = true;
      }
      const t = now - start;

      /* ---------- the fade-in: a low ambient glow under the logo ---------- */
      const fade = Math.min(1, t / 420);
      if (glowRef.current) {
        glowRef.current.style.opacity = String(0.18 + 0.82 * fade * fade);
      }

      /* ---------- the logo locks dead-centre ---------- */
      if (t < T_ZOOM_START && lockRef.current) {
        const p = Math.min(1, t / 240);
        const e = easeOutQuart(p);
        lockRef.current.style.opacity = String(Math.min(1, e * 1.7));
        lockRef.current.style.transform = `scale(${(1.16 - 0.16 * e).toFixed(4)})`;
      }

      /* ---------- the plates flip through the letterforms ---------- */
      /* the chrome fill hands over to the plates */
      const plateAlpha = Math.min(1, Math.max(0, (t - T_MONTAGE_START) / 200));
      if (metalRef.current) {
        metalRef.current.style.opacity = String(1 - plateAlpha);
      }
      if (t >= nextFrameAt && flips < FRAMES.length - 1) {
        const outEl = layers[frontIdx].current;
        const inEl = layers[1 - frontIdx].current;
        if (outEl && inEl) {
          frameIndex = (frameIndex + 1) % FRAMES.length;
          flips += 1;
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
        /* a fixed grid, so a late frame does not push the whole montage
         * later — it catches up instead */
        nextFrameAt += FRAME_MS;
        if (nextFrameAt < t) nextFrameAt = t + FRAME_MS;
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

      /* ---------- the MARVEL ZOOM: the final three seconds ----------
       * The logo stays locked dead-centre and accelerates straight at the
       * viewer. The curve is a power ramp, so it drifts for a beat and
       * then rushes — the classic movie-intro push. */
      if (t >= T_ZOOM_START) {
        const p = Math.min(1, (t - T_ZOOM_START) / (T_TOTAL - T_ZOOM_START));
        /* accelerating: p^2.6 barely moves at first, then explodes */
        const e = Math.pow(p, 2.6);
        if (lockRef.current) {
          lockRef.current.style.transform = `scale(${(1 + 7.5 * e).toFixed(4)})`;
        }
        /* the anamorphic streak sweeps across the logo as it rushes */
        if (flareRef.current) {
          const sweep = p;
          const flare = Math.sin(Math.min(1, sweep * 1.15) * Math.PI);
          flareRef.current.style.opacity = String(0.35 + 0.65 * flare);
          flareRef.current.style.transform =
            `translate3d(${(-60 + 120 * sweep).toFixed(1)}%, -50%, 0) ` +
            `scaleX(${(0.5 + 3.2 * flare).toFixed(3)})`;
        }
        /* the core bloom behind the letters swells with the push */
        if (bloomRef.current) {
          bloomRef.current.style.opacity = String(0.2 + 0.8 * e);
          bloomRef.current.style.transform =
            `translate(-50%,-50%) scale(${(0.5 + 2.6 * e).toFixed(4)})`;
        }
      }

      /* ---------- the flash, then the cut into the lobby ---------- */
      if (t >= T_FLASH) {
        /* The music hands over to its ambient level over exactly the
         * length of the flash - the same transition the visitor sees. */
        if (!fading) {
          fading = true;
          rampChogThemeTo(AMBIENT_VOLUME, T_TRANSITION);
        }
        const p = Math.min(1, (t - T_FLASH) / (T_TOTAL - T_FLASH));
        const e = easeOutQuad(p);
        if (flashRef.current) {
          flashRef.current.style.opacity = String(Math.min(1, e * 2.2));
          flashRef.current.style.transform = `scale(${(0.15 + 1.45 * e).toFixed(4)})`;
        }
        if (veilRef.current) {
          veilRef.current.style.opacity = String(Math.min(0.5, e * 0.7));
        }
        if (!completed && t >= T_FLASH + 120) {
          completed = true;
          /* the lobby is mounted underneath the flash from here on */
          completeRef.current?.();
        }
      }

      /* Safety net: if the route change never lands, the white veil fades
       * out so the visitor is never stranded on a white screen. */
      if (t >= T_TOTAL + 2000 && veilRef.current) {
        const p = Math.min(1, (t - (T_TOTAL + 2000)) / 320);
        veilRef.current.style.opacity = String(0.5 * (1 - p));
        if (p >= 1) {
          finishedRef.current?.();
          return; /* the sequence is over */
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      /* If the sequence was torn down before the flash, do not leave the
       * track blaring at full energy in the lobby - hand it over anyway.
       * The ramp lives in the theme module, so it finishes even though
       * this component is gone.
       *
       * `running` keeps this away from the development-only double mount,
       * where the cleanup fires before the sequence has begun. */
      if (!fading && running) {
        fading = true;
        rampChogThemeTo(AMBIENT_VOLUME, T_TRANSITION);
      }
    };
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
            {/* the cycling plates — the artwork is portrait, so the lockup
                crops a band around the subject's face */}
            <img
              ref={layerARef}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              style={{
                willChange: "transform, opacity",
                objectPosition: "center 38%",
              }}
            />
            <img
              ref={layerBRef}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              style={{
                willChange: "transform, opacity",
                objectPosition: "center 38%",
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

      {/* ---- the lens flare: the anamorphic streak + the core bloom ---- */}
      <div
        ref={bloomRef}
        className="pointer-events-none absolute left-1/2 top-1/2 h-[70vmin] w-[70vmin] -translate-x-1/2 -translate-y-1/2"
        style={{
          opacity: 0,
          transform: "translate(-50%,-50%) scale(0.5)",
          background:
            "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.55) 0%, " +
            "rgba(255,47,185,0.34) 26%, rgba(168,85,247,0.18) 46%, rgba(5,3,12,0) 70%)",
          filter: "blur(10px)",
          willChange: "transform, opacity",
        }}
      />
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

      {/* ---- the flash, then the cut into the lobby ---- */}
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
