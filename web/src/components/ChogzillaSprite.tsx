"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { FighterClass } from "@/config/fighterClasses";
import { getFighterMoveSet, type SpecialMove } from "@/data/fighterMoves";
import { FighterSprite, type SpriteState } from "./FighterSprite";

const DEFAULT_SHEET = "/assets/chog-slash.png";

/** Classes with 4-frame canvas sprite-sheet art (others use the SVG rig). */
export const CLASS_SPRITE_SHEETS: Partial<Record<FighterClass, string>> = {
  berserker: "/assets/chog-slash.png", // Warlord Chogzilla
  samurai: "/assets/chog-samurai.png", // Chog Samurai
  mage: "/assets/void-james.png", // Void Lord James
};

type ChogzillaSpriteProps = {
  state?: SpriteState;
  facing?: "left" | "right";
  /** Rendered height in px (width scales with the frame aspect). */
  size?: number;
  /** Bump to re-trigger non-looping animations on state changes. */
  animKey?: number | string;
  /** Horizontal 4-pose sprite sheet on a dark charcoal background. */
  spriteSheetSrc?: string;
  /** Drives attack VFX particles + floating move-name tag from fighterMoves. */
  fighterClass?: FighterClass;
  className?: string;
  /** Active move name banner — ONLY rendered when an actual special/critical is triggered */
  activeMoveName?: string | null;
  /** Velocity lean direction: forward when dashing toward foe, retreat when backing up */
  leanDir?: "forward" | "retreat" | null;
  /** Whether guarding/blocking */
  isBlocking?: boolean;
};

/** 4-pose sprite sheet: column per state (bottom12% captions cropped out). */
const FRAME: Record<SpriteState, number> = {
  idle: 0,
  dashIn: 0,
  attack: 1,
  stagger: 2,
  dashOut: 0,
  hit: 2,
  dead: 2,
  secondWind: 3,
  victory: 3,
};

const FRAME_COUNT = 4;

/* ------------------------------------------------------------------ image */

const processedCache = new Map<string, Promise<HTMLCanvasElement>>();

/**
 * Load a sprite sheet once: crop the bottom 12% caption strip, then remove
 * the backdrop via a border-connected flood fill (each sheet has its own
 * charcoal or pure-black background). Only pixels CONNECTED to the border
 * and matching the sampled corner color are keyed out — dark interior
 * details (armor, shadows, black outfits) are preserved instead of being
 * punched full of holes. Results are cached per source URL.
 */
function getProcessedImage(src: string): Promise<HTMLCanvasElement> {
  const cached = processedCache.get(src);
  if (cached) return cached;

  const promise = new Promise<HTMLCanvasElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.onload = () => {
      try {
        const sh = Math.floor(img.height * 0.88); // drop text captions
        const off = document.createElement("canvas");
        off.width = img.width;
        off.height = sh;
        const ctx = off.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D unavailable");
        ctx.drawImage(img, 0, 0, img.width, sh, 0, 0, img.width, sh);

        const data = ctx.getImageData(0, 0, off.width, off.height);
        const px = data.data;
        const W = off.width;
        const H = off.height;
        const frameW = Math.floor(W / FRAME_COUNT);

        const visited = new Uint8Array(W * H);
        const TOL_SQ = 45 * 45;

        /* Perimeter BFS flood-fill per frame: flood only outer background from
         * the 4 borders of each frame inward so 100% of interior armor and linework
         * stays solid and opaque. */
        for (let f = 0; f < FRAME_COUNT; f += 1) {
          const startX = f * frameW;
          const endX = f === FRAME_COUNT - 1 ? W : (f + 1) * frameW;

          /* Sample backdrop color from the 4 corners of this specific frame */
          const cTopLeft = startX;
          const cTopRight = endX - 1;
          const cBotLeft = (H - 1) * W + startX;
          const cBotRight = (H - 1) * W + (endX - 1);
          const cornerIndices = [cTopLeft, cTopRight, cBotLeft, cBotRight];

          let br = 0;
          let bg = 0;
          let bb = 0;
          for (const c of cornerIndices) {
            br += px[c * 4];
            bg += px[c * 4 + 1];
            bb += px[c * 4 + 2];
          }
          br = Math.round(br / 4);
          bg = Math.round(bg / 4);
          bb = Math.round(bb / 4);

          const matchesBg = (idx: number) => {
            const dr = px[idx * 4] - br;
            const dg = px[idx * 4 + 1] - bg;
            const db = px[idx * 4 + 2] - bb;
            return dr * dr + dg * dg + db * db <= TOL_SQ;
          };

          const queue: number[] = [];
          const tryPush = (x: number, y: number) => {
            if (x < startX || x >= endX || y < 0 || y >= H) return;
            const idx = y * W + x;
            if (visited[idx]) return;
            if (!matchesBg(idx)) return;
            visited[idx] = 1;
            queue.push(idx);
          };

          /* Seed BFS from top and bottom perimeter edges */
          for (let x = startX; x < endX; x += 1) {
            tryPush(x, 0);
            tryPush(x, H - 1);
          }
          /* Seed BFS from left and right perimeter edges */
          for (let y = 0; y < H; y += 1) {
            tryPush(startX, y);
            tryPush(endX - 1, y);
          }

          let head = 0;
          while (head < queue.length) {
            const idx = queue[head++];
            px[idx * 4 + 3] = 0; // Transparent
            const x = idx % W;
            const y = (idx / W) | 0;

            if (x > startX) tryPush(x - 1, y);
            if (x < endX - 1) tryPush(x + 1, y);
            if (y > 0) tryPush(x, y - 1);
            if (y < H - 1) tryPush(x, y + 1);
          }
        }

        ctx.putImageData(data, 0, 0);
        resolve(off);
      } catch (error) {
        reject(error);
      }
    };
    img.src = src;
  });

  processedCache.set(src, promise);
  return promise;
}

/* ----------------------------------------------------------------- sprite */

/**
 * 4-frame canvas fighter (idle / attack / hit-dead / victory-secondWind)
 * with chroma-keyed transparency and per-state combat motion — breathing
 * aura, forward dash, knockback flash, lightning surge. Accepts any
 * horizontal 4-pose sheet via `spriteSheetSrc`.
 */
export function ChogzillaSprite({
  state = "idle",
  facing = "right",
  size = 160,
  animKey,
  spriteSheetSrc = DEFAULT_SHEET,
  fighterClass,
  className,
  activeMoveName,
  leanDir,
  isBlocking,
}: ChogzillaSpriteProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ghostRef = useRef<HTMLCanvasElement | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const signatureMove: SpecialMove | null = fighterClass
    ? getFighterMoveSet(fighterClass).signatureMove
    : null;

  /* Draw the matching frame from the processed sheet. On pose changes the
   * previous frame is held on the ghost canvas and dissolved into the new
   * one (Web Animations API) so state swaps never hard-snap. */
  useEffect(() => {
    let cancelled = false;
    getProcessedImage(spriteSheetSrc)
      .then((processed) => {
        if (cancelled || !canvasRef.current) return;
        const frameW = Math.floor(processed.width / FRAME_COUNT);
        const frameH = processed.height;
        const canvas = canvasRef.current;
        const next = FRAME[state];
        const prev = lastFrameRef.current;
        canvas.width = frameW;
        canvas.height = frameH;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, frameW, frameH);
        ctx.drawImage(
          processed,
          next * frameW,
          0,
          frameW,
          frameH,
          0,
          0,
          frameW,
          frameH,
        );

        /* Pose crossfade: ghost holds the outgoing pose and dissolves away
         * behind the new pose. The live canvas stays at full opacity —
         * only the ghost animates — so the fighter is never translucent. */
        if (prev !== null && prev !== next && ghostRef.current) {
          const ghost = ghostRef.current;
          ghost.getAnimations().forEach((a) => a.cancel());
          ghost.width = frameW;
          ghost.height = frameH;
          const gctx = ghost.getContext("2d");
          if (gctx) {
            gctx.clearRect(0, 0, frameW, frameH);
            gctx.drawImage(
              processed,
              prev * frameW,
              0,
              frameW,
              frameH,
              0,
              0,
              frameW,
              frameH,
            );
            ghost.animate([{ opacity: 1 }, { opacity: 0 }], {
              duration: 170,
              easing: "ease-out",
              fill: "forwards",
            });
          }
        }
        lastFrameRef.current = next;
      })
      .catch(() => {
        /* asset missing — leave canvas blank */
      });
    return () => {
      cancelled = true;
    };
  }, [state, spriteSheetSrc]);

  /* Procedural motion classes:
   * - idle: sinusoidal vertical breathing
   * - attack: 3-phase spring (compress -> exponential lunge -> recoil)
   * - hit / stagger: white/red damage flash + knockback slide
   */
  const motionClass =
    state === "idle"
      ? "procedural-idle-breathe"
      : state === "dashIn"
        ? "fighter-dash-in"
        : state === "attack"
          ? "spring-attack-strike"
          : state === "stagger" || state === "hit"
            ? "hit-knockback-slide"
            : state === "dashOut"
              ? "fighter-dash-out"
              : state === "dead"
                ? "sprite-dead"
                : state === "secondWind"
                  ? "sprite-levitate"
                  : state === "victory"
                    ? "sprite-victory-body"
                    : "";

  const leanClass =
    leanDir === "forward"
      ? "fighter-lean-forward"
      : leanDir === "retreat"
        ? "fighter-lean-retreat"
        : isBlocking
          ? "assist-block"
          : "";

  const hotAura =
    state === "secondWind" ||
    state === "victory" ||
    state === "attack" ||
    state === "dashIn";

  return (
    <div
      key={animKey ?? "static"}
      className={cn(
        "sprite-pixelated relative inline-block select-none opacity-100",
        facing === "left" && "sprite-mirror",
        className,
      )}
      style={{ height: size, lineHeight: 0 }}
      aria-hidden
    >
      {/* Floating weapon aura with procedural breathing pulse */}
      <div
        className={cn(
          "weapon-aura-float pointer-events-none absolute inset-x-[-18%] bottom-[4%] top-[10%] rounded-full opacity-65 blur-2xl",
          hotAura ? "sprite-aura-hot" : "sprite-aura",
        )}
        style={{
          background:
            "radial-gradient(circle at 50% 65%, rgba(249,115,22,0.5), rgba(168,85,247,0.35) 55%, transparent 75%)",
        }}
      />
      {/* Subtle white/purple rim backlight behind sprite */}
      <div
        className="pointer-events-none absolute inset-x-[-10%] inset-y-[8%] rounded-[45%] blur-xl"
        style={{
          background:
            "radial-gradient(circle at 50% 42%, rgba(255,255,255,0.14), rgba(196,181,253,0.10) 55%, transparent 75%)",
        }}
        aria-hidden
      />
      {/* Purple/gold lightning surge for Second Wind / Victory */}
      {(state === "secondWind" || state === "victory") && (
        <div
          className="animate-second-wind-flash pointer-events-none absolute inset-x-[-25%] -top-[15%] bottom-0 bg-gradient-to-b from-transparent via-purple-500/50 to-amber-400/40 blur-xl"
          aria-hidden
        />
      )}
      {/* Red damage flash on hit & stagger */}
      {(state === "hit" || state === "stagger") && (
        <div
          className="sprite-flash pointer-events-none absolute inset-0 z-20 bg-red-500/45"
          aria-hidden
        />
      )}

      {/* Motion wrapper with procedural squash, stretch, and lean transforms */}
      <div className={cn("relative will-change-transform", motionClass, leanClass)}>
        {/* Ghost canvas: outgoing pose dissolving away on state changes */}
        <canvas
          ref={ghostRef}
          className="sprite-pixelated pointer-events-none absolute left-0 top-0 z-0"
          style={{
            height: size,
            width: "auto",
            imageRendering: "pixelated",
            opacity: 0,
          }}
        />
        <canvas
          ref={canvasRef}
          className="sprite-pixelated relative z-10"
          style={{ height: size, width: "auto", imageRendering: "pixelated" }}
        />
      </div>

      {/* Moveset-driven attack VFX & banner: ONLY when an active special or critical move is triggered */}
      {state === "attack" && activeMoveName && signatureMove && (
        <>
          <MoveVfxParticles
            key={`vfx-${animKey ?? "static"}`}
            vfxType={signatureMove.vfxType}
          />
          <span
            key={`mv-${animKey ?? "static"}`}
            className="animate-damage-float pointer-events-none absolute -top-2 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap text-[11px] font-black uppercase tracking-wider text-fuchsia-200 drop-shadow-[0_0_10px_rgba(232,121,249,0.95)]"
            style={{ animationDuration: "0.55s" }}
            aria-hidden
          >
            {activeMoveName}
          </span>
        </>
      )}

      {/* Impact shake while attacking */}
      {state === "attack" && (
        <div className="pointer-events-none absolute inset-0 z-20 animate-hit-shake" />
      )}
    </div>
  );
}

/* ------------------------------------------------- moveset VFX particles */

/**
 * Layered, soft special-move FX per SpecialMove.vfxType from fighterMoves.ts:
 *   magma     — Warlord Chogzilla: floating ember particles + heat bloom
 *   slash     — Chog Samurai: plasma slash lines (white core, fuchsia bloom)
 *   laser     — Keone Mage: soft neon electrical arcs around a charged core
 *   void_rift — Void Lord James: dark void ripples + swirling dark core
 * All layers stay crisp against the pixel sprite and finish within the
 * attack+dashOut particle window (~360ms of un-paused time).
 */
function MoveVfxParticles({
  vfxType,
}: {
  vfxType: SpecialMove["vfxType"];
}) {
  if (vfxType === "slash") {
    return (
      <div className="pointer-events-none absolute inset-0 z-20" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="slash-streak absolute h-0.5 w-16 rounded-full"
            style={{
              left: "54%",
              top: `${32 + i * 15}%`,
              transform: `rotate(${-24 + i * 13}deg)`,
              animationDelay: `${i * 50}ms`,
              background:
                "linear-gradient(90deg, transparent, rgba(240,171,252,0.95) 30%, #fff 50%, rgba(168,85,247,0.95) 72%, transparent)",
              boxShadow:
                "0 0 10px rgba(232,121,249,0.9), 0 0 22px rgba(168,85,247,0.55)",
              filter: "drop-shadow(0 0 4px rgba(255,255,255,0.8))",
            }}
          />
        ))}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          {["M 40 74 Q 66 60 92 34", "M 36 46 Q 64 52 90 70"].map((d, i) => (
            <g key={d}>
              <path
                d={d}
                fill="none"
                stroke="rgba(232,121,249,0.75)"
                strokeWidth="3.2"
                strokeLinecap="round"
                pathLength={120}
                strokeDasharray={120}
                className="plasma-arc-sweep"
                style={{
                  animationDelay: `${i * 60}ms`,
                  filter: "drop-shadow(0 0 5px rgba(232,121,249,0.95))",
                }}
              />
              <path
                d={d}
                fill="none"
                stroke="rgba(255,255,255,0.95)"
                strokeWidth="1"
                strokeLinecap="round"
                pathLength={120}
                strokeDasharray={120}
                className="plasma-arc-sweep"
                style={{ animationDelay: `${i * 60 + 30}ms` }}
              />
            </g>
          ))}
        </svg>
      </div>
    );
  }
  if (vfxType === "magma") {
    return (
      <div className="pointer-events-none absolute inset-0 z-20" aria-hidden>
        {/* Heat bloom at the feet */}
        <div
          className="ember-heat absolute bottom-[6%] left-1/2 h-10 w-24 -translate-x-1/2 rounded-full"
          style={{
            background:
              "radial-gradient(ellipse at 50% 80%, rgba(249,115,22,0.75), rgba(239,68,68,0.35) 55%, transparent 78%)",
            filter: "blur(6px)",
          }}
        />
        {/* Floating embers with per-particle drift */}
        {Array.from({ length: 9 }).map((_, i) => {
          const drift = (i % 2 === 0 ? 1 : -1) * (6 + (i % 3) * 5);
          const d = 3 + (i % 3) * 2.5;
          return (
            <span
              key={i}
              className="ember-particle absolute rounded-full"
              style={
                {
                  left: `${44 + ((i * 7) % 24)}%`,
                  bottom: `${8 + ((i * 5) % 18)}%`,
                  width: d,
                  height: d,
                  background:
                    "radial-gradient(circle at 35% 35%, #fde68a, #f97316 55%, rgba(239,68,68,0.6) 78%, transparent 100%)",
                  boxShadow: "0 0 7px rgba(249,115,22,0.95)",
                  "--drift": `${drift}px`,
                  "--rise": `${-36 - (i % 4) * 8}px`,
                  "--dur": "0.28s",
                  animationDelay: `${i * 10}ms`,
                } as CSSProperties
              }
            />
          );
        })}
      </div>
    );
  }
  if (vfxType === "laser") {
    const bolts = ["M 44 22 L 54 38 L 46 46 L 58 64", "M 48 74 L 56 60 L 50 52 L 62 34"];
    return (
      <div className="pointer-events-none absolute inset-0 z-20" aria-hidden>
        {/* Charged core orb */}
        <div
          className="arc-orb-pop absolute left-1/2 top-1/2 h-16 w-16 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(34,211,238,0.8) 32%, rgba(232,121,249,0.5) 60%, transparent 78%)",
            filter: "blur(2px)",
          }}
        />
        {/* Soft neon electrical arcs — cyan outer glow, white hot core */}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          {bolts.map((d, i) => (
            <g key={d}>
              <path
                d={d}
                fill="none"
                stroke="rgba(103,232,249,0.85)"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={60}
                strokeDasharray={60}
                className="neon-crackle"
                style={{
                  animationDelay: `${i * 50}ms`,
                  filter: "drop-shadow(0 0 6px rgba(34,211,238,0.95))",
                }}
              />
              <path
                d={d}
                fill="none"
                stroke="rgba(255,255,255,0.9)"
                strokeWidth="0.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={60}
                strokeDasharray={60}
                className="neon-crackle"
                style={{ animationDelay: `${i * 50 + 30}ms` }}
              />
            </g>
          ))}
        </svg>
      </div>
    );
  }
  /* void_rift — dark void ripples with violet rims + swirling dark core */
  return (
    <div className="pointer-events-none absolute inset-0 z-20" aria-hidden>
      <div
        className="void-swirl absolute left-1/2 top-1/2 h-20 w-20 rounded-full"
        style={{
          background:
            "conic-gradient(from 0deg, rgba(88,28,135,0.9), rgba(10,5,20,0.95) 40%, rgba(168,85,247,0.7) 70%, rgba(88,28,135,0.9))",
          filter: "blur(3px)",
        }}
      />
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="void-ripple absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: 44 + i * 22,
            height: 44 + i * 22,
            border: "2px solid rgba(168,85,247,0.85)",
            background:
              "radial-gradient(circle, rgba(6,3,12,0.85) 0%, rgba(6,3,12,0.55) 55%, transparent 75%)",
            boxShadow:
              "0 0 14px rgba(168,85,247,0.6), inset 0 0 12px rgba(168,85,247,0.5)",
            animationDelay: `${i * 60}ms`,
          }}
        />
      ))}
      {["ᚠ", "ᚦ"].map((glyph, i) => (
        <span
          key={glyph}
          className="rune-float absolute text-xs font-bold text-purple-300"
          style={{
            left: `${58 + i * 12}%`,
            top: "28%",
            animationDelay: `${i * 60}ms`,
            animationDuration: "0.24s",
            textShadow: "0 0 6px rgba(168,85,247,0.9)",
          }}
        >
          {glyph}
        </span>
      ))}
    </div>
  );
}

/* -------------------------------------------------- class-aware dispatch */

/**
 * Renders the 4-frame canvas sheet for classes that have art
 * (berserker → chog-slash.png, samurai → chog-samurai.png) and falls back
 * to the SVG FighterSprite rig for all other classes.
 */
export function SheetFighter({
  fighterClass,
  state,
  facing,
  size,
  animKey,
  className,
  activeMoveName,
  leanDir,
  isBlocking,
}: {
  fighterClass: FighterClass;
  state?: SpriteState;
  facing?: "left" | "right";
  size?: number;
  animKey?: number | string;
  className?: string;
  activeMoveName?: string | null;
  leanDir?: "forward" | "retreat" | null;
  isBlocking?: boolean;
}) {
  const spriteSheetSrc = CLASS_SPRITE_SHEETS[fighterClass];
  if (spriteSheetSrc) {
    return (
      <ChogzillaSprite
        spriteSheetSrc={spriteSheetSrc}
        state={state}
        facing={facing}
        size={size}
        animKey={animKey}
        fighterClass={fighterClass}
        className={className}
        activeMoveName={activeMoveName}
        leanDir={leanDir}
        isBlocking={isBlocking}
      />
    );
  }
  return (
    <FighterSprite
      fighterClass={fighterClass}
      state={state}
      facing={facing}
      size={size}
      animKey={animKey}
      className={className}
    />
  );
}
