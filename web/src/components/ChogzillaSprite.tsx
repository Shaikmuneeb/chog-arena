"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { FighterClass } from "@/config/fighterClasses";
import { FighterSprite, type SpriteState } from "./FighterSprite";

const DEFAULT_SHEET = "/assets/chog-slash.png";

/** Classes with 4-frame canvas sprite-sheet art (others use the SVG rig). */
export const CLASS_SPRITE_SHEETS: Partial<Record<FighterClass, string>> = {
  berserker: "/assets/chog-slash.png", // Warlord Chogzilla
  samurai: "/assets/chog-samurai.png", // Chog Samurai
  mage: "/assets/void-james.png", // Void Lord James
  juggernaut: "/assets/keone-mage.png", // Keone Mage
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
  className?: string;
};

/** 4-pose sprite sheet: column per state (bottom12% captions cropped out). */
const FRAME: Record<SpriteState, number> = {
  idle: 0,
  attack: 1,
  hit: 2,
  dead: 2,
  secondWind: 3,
  victory: 3,
};

const FRAME_COUNT = 4;

/* ------------------------------------------------------------------ image */

const processedCache = new Map<string, Promise<HTMLCanvasElement>>();

/**
 * Load a sprite sheet once: crop the bottom 12% caption strip, then
 * chroma-key the dark charcoal background (r<38 && g<38 && b<45) to alpha 0.
 * Results are cached per source URL for every component instance.
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
        for (let i = 0; i < px.length; i += 4) {
          if (px[i] < 38 && px[i + 1] < 38 && px[i + 2] < 45) {
            px[i + 3] = 0;
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
  className,
}: ChogzillaSpriteProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /* Draw the matching frame from the processed sheet. */
  useEffect(() => {
    let cancelled = false;
    getProcessedImage(spriteSheetSrc)
      .then((processed) => {
        if (cancelled || !canvasRef.current) return;
        const frameW = Math.floor(processed.width / FRAME_COUNT);
        const frameH = processed.height;
        const canvas = canvasRef.current;
        canvas.width = frameW;
        canvas.height = frameH;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, frameW, frameH);
        ctx.drawImage(
          processed,
          FRAME[state] * frameW,
          0,
          frameW,
          frameH,
          0,
          0,
          frameW,
          frameH,
        );
      })
      .catch(() => {
        /* asset missing — leave canvas blank */
      });
    return () => {
      cancelled = true;
    };
  }, [state, spriteSheetSrc]);

  const motionClass =
    state === "idle"
      ? "sprite-idle"
      : state === "attack"
        ? "sprite-dash"
        : state === "hit"
          ? "sprite-recoil"
          : state === "dead"
            ? "sprite-dead"
            : state === "secondWind"
              ? "sprite-levitate"
              : state === "victory"
                ? "sprite-victory-body"
                : "";

  const hotAura =
    state === "secondWind" || state === "victory" || state === "attack";

  return (
    <div
      key={`${state}-${animKey ?? "static"}`}
      className={cn(
        "relative inline-block select-none",
        facing === "left" && "sprite-mirror",
        className,
      )}
      style={{ height: size, lineHeight: 0 }}
      aria-hidden
    >
      {/* Fiery orange/purple aura glow (idle breathing) */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-[-18%] bottom-[4%] top-[10%] rounded-full blur-2xl",
          hotAura ? "sprite-aura-hot" : "sprite-aura",
        )}
        style={{
          background:
            "radial-gradient(circle at 50% 65%, rgba(249,115,22,0.5), rgba(168,85,247,0.35) 55%, transparent 75%)",
        }}
      />
      {/* Purple/gold lightning surge for Second Wind / Victory */}
      {(state === "secondWind" || state === "victory") && (
        <div
          className="animate-second-wind-flash pointer-events-none absolute inset-x-[-25%] -top-[15%] bottom-0 bg-gradient-to-b from-transparent via-purple-500/50 to-amber-400/40 blur-xl"
          aria-hidden
        />
      )}
      {/* Red/white damage flash on hit */}
      {state === "hit" && (
        <div
          className="sprite-flash pointer-events-none absolute inset-0 z-20 bg-red-500/60 mix-blend-screen"
          aria-hidden
        />
      )}

      <canvas
        ref={canvasRef}
        className={cn("relative z-10", motionClass)}
        style={{ height: size, width: "auto", imageRendering: "auto" }}
      />

      {/* Impact shake while dashing */}
      {state === "attack" && (
        <div className="pointer-events-none absolute inset-0 z-20 animate-hit-shake" />
      )}
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
}: {
  fighterClass: FighterClass;
  state?: SpriteState;
  facing?: "left" | "right";
  size?: number;
  animKey?: number | string;
  className?: string;
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
        className={className}
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
