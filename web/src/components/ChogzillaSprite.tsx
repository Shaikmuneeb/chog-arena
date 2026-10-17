"use client";

import { useEffect, useRef } from "react";
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
  /** Drives attack VFX particles + floating move-name tag from fighterMoves. */
  fighterClass?: FighterClass;
  className?: string;
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
  fighterClass,
  className,
}: ChogzillaSpriteProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const signatureMove: SpecialMove | null = fighterClass
    ? getFighterMoveSet(fighterClass).signatureMove
    : null;

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
      : state === "dashIn"
        ? "fighter-dash-in"
        : state === "attack"
          ? "chog-combo-attack"
          : state === "stagger"
            ? "fighter-stagger"
            : state === "dashOut"
              ? "fighter-dash-out"
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
    state === "secondWind" ||
    state === "victory" ||
    state === "attack" ||
    state === "dashIn";

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
      {/* Red/white damage flash on hit & stagger */}
      {(state === "hit" || state === "stagger") && (
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

      {/* Moveset-driven attack VFX: particles + floating signature-move name */}
      {state === "attack" && signatureMove && (
        <>
          <MoveVfxParticles
            key={`vfx-${animKey ?? "static"}`}
            vfxType={signatureMove.vfxType}
          />
          <span
            key={`mv-${animKey ?? "static"}`}
            className="animate-damage-float pointer-events-none absolute -top-1 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap text-[10px] font-black uppercase tracking-wider text-fuchsia-200 drop-shadow-[0_0_8px_rgba(232,121,249,0.9)]"
            aria-hidden
          >
            {signatureMove.name}
          </span>
        </>
      )}

      {/* Impact shake while dashing */}
      {state === "attack" && (
        <div className="pointer-events-none absolute inset-0 z-20 animate-hit-shake" />
      )}
    </div>
  );
}

/* ------------------------------------------------- moveset VFX particles */

/**
 * Lightweight attack particles styled per SpecialMove.vfxType from
 * fighterMoves.ts — slash streaks, magma embers, laser beams, void rings.
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
            className="slash-streak absolute h-0.5 w-16 bg-gradient-to-r from-transparent via-purple-300 to-transparent"
            style={{
              left: "55%",
              top: `${34 + i * 14}%`,
              transform: `rotate(${-22 + i * 12}deg)`,
              animationDelay: `${i * 80}ms`,
              boxShadow: "0 0 8px rgba(168,85,247,0.9)",
            }}
          />
        ))}
      </div>
    );
  }
  if (vfxType === "magma") {
    return (
      <div className="pointer-events-none absolute inset-0 z-20" aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className="magma-particle absolute h-1.5 w-1.5 rounded-full"
            style={{
              left: `${48 + (i % 3) * 10}%`,
              bottom: "12%",
              background: i % 2 ? "#f97316" : "#ef4444",
              boxShadow: "0 0 6px rgba(249,115,22,0.95)",
              animationDelay: `${i * 60}ms`,
            }}
          />
        ))}
      </div>
    );
  }
  if (vfxType === "laser") {
    return (
      <div className="pointer-events-none absolute inset-0 z-20" aria-hidden>
        {[0, 1].map((i) => (
          <span
            key={i}
            className="laser-beam absolute h-1 w-20"
            style={{
              left: "58%",
              top: `${42 + i * 12}%`,
              background:
                "linear-gradient(90deg, transparent, #22d3ee 40%, #e879f9 70%, transparent)",
              boxShadow: "0 0 10px rgba(34,211,238,0.9)",
              animationDelay: `${i * 90}ms`,
            }}
          />
        ))}
      </div>
    );
  }
  /* void_rift */
  return (
    <div className="pointer-events-none absolute inset-0 z-20" aria-hidden>
      <div
        className="void-slam-ring absolute h-14 w-14 rounded-full"
        style={{
          left: "52%",
          top: "40%",
          background:
            "radial-gradient(circle, transparent 40%, rgba(168,85,247,0.9) 55%, rgba(88,28,135,0.6) 70%, transparent 80%)",
        }}
      />
      {["ᚠ", "ᚦ"].map((glyph, i) => (
        <span
          key={glyph}
          className="rune-float absolute text-xs font-bold text-purple-300"
          style={{
            left: `${58 + i * 12}%`,
            top: "30%",
            animationDelay: `${i * 110}ms`,
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
        fighterClass={fighterClass}
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
