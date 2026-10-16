"use client";

import { cn } from "@/lib/utils";
import { FIGHTER_CLASS_META, type FighterClass } from "@/config/fighterClasses";

export type SpriteState =
  | "idle"
  | "attack"
  | "hit"
  | "secondWind"
  | "dead"
  | "victory";

type FighterSpriteProps = {
  fighterClass: FighterClass;
  state?: SpriteState;
  /** Which way the fighter faces. "left" mirrors the whole rig. */
  facing?: "left" | "right";
  /** Sprite height in px (width scales with the 100×140 viewBox). */
  size?: number;
  /** Bump this to re-trigger non-looping animations on state changes. */
  animKey?: number | string;
  className?: string;
};

/**
 * Full-body 2D animated fighter rig (SVG): helmet, armored torso, weapon
 * arm, off-hand, legs, and glowing aura. Class-specific armor + weapons;
 * states: idle / attack / hit / secondWind / dead / victory. Mirroring via
 * an outer scaleX so all CSS animations stay symmetric.
 */
export function FighterSprite({
  fighterClass,
  state = "idle",
  facing = "right",
  size = 160,
  animKey,
  className,
}: FighterSpriteProps) {
  const theme = FIGHTER_CLASS_META[fighterClass];
  const width = Math.round((size * 100) / 140);

  const bodyClass = cn(
    "sprite-body",
    state === "idle" && "sprite-idle",
    state === "attack" && "sprite-dash",
    state === "hit" && "sprite-recoil",
    state === "dead" && "sprite-dead",
    state === "secondWind" && "sprite-levitate",
    state === "victory" && "sprite-victory-body",
  );

  const weaponClass = cn(
    "sprite-weapon",
    state === "attack" && "sprite-weapon-swing",
    state === "victory" && "sprite-weapon-raise",
  );

  return (
    <div
      key={`${state}-${animKey ?? "static"}`}
      className={cn(
        "relative select-none",
        facing === "left" && "sprite-mirror",
        className,
      )}
      style={{ height: size, width }}
      aria-hidden
    >
      <svg
        viewBox="0 0 100 140"
        height={size}
        width={width}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient
            id={`armor-${fighterClass}`}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0%" stopColor={theme.primary} />
            <stop offset="100%" stopColor={theme.dark} />
          </linearGradient>
          <radialGradient id={`aura-${fighterClass}`}>
            <stop offset="0%" stopColor={theme.secondary} stopOpacity="0.55" />
            <stop offset="100%" stopColor={theme.secondary} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`pillar-${fighterClass}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a855f7" stopOpacity="0" />
            <stop offset="35%" stopColor="#a855f7" stopOpacity="0.75" />
            <stop offset="70%" stopColor="#fbbf24" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
          </linearGradient>
          <filter id={`glow-${fighterClass}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Ground aura */}
        <ellipse
          className={cn(
            "sprite-aura",
            (state === "victory" || state === "secondWind") && "sprite-aura-hot",
          )}
          cx="50"
          cy="130"
          rx="30"
          ry="8"
          fill={`url(#aura-${fighterClass})`}
        />

        {/* Second Wind lightning pillar from the sky */}
        {state === "secondWind" && (
          <polygon
            className="sprite-pillar"
            points="34,-10 66,-10 80,132 20,132"
            fill={`url(#pillar-${fighterClass})`}
          />
        )}

        {/* ================= BODY ================= */}
        <g
          className={bodyClass}
          style={{ transformOrigin: "50px 130px", transformBox: "view-box" }}
        >
          {/* Legs */}
          <g stroke={theme.secondary} strokeWidth="1.2" strokeLinejoin="round">
            <path
              d="M42 86 L36 124 L45 126 L48 88 Z"
              fill={theme.dark}
            />
            <path
              d="M52 88 L56 126 L65 124 L58 86 Z"
              fill={`url(#armor-${fighterClass})`}
            />
            {/* Boots */}
            <path d="M34 122 L46 122 L47 130 L32 130 Z" fill={theme.dark} />
            <path d="M55 122 L67 122 L69 130 L54 130 Z" fill={theme.dark} />
          </g>

          {/* Torso armor */}
          <path
            d="M33 54 L67 54 L72 90 L28 90 Z"
            fill={`url(#armor-${fighterClass})`}
            stroke={theme.secondary}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          {/* Chest core */}
          <circle
            cx="50"
            cy="68"
            r="5"
            fill={theme.secondary}
            opacity="0.9"
            filter={`url(#glow-${fighterClass})`}
          />
          {/* Belt */}
          <rect x="30" y="86" width="40" height="5" rx="1.5" fill={theme.dark} stroke={theme.secondary} strokeWidth="0.8" />

          {/* Shoulder pads */}
          <path
            d="M28 52 Q 22 56 26 64 L 36 58 Z"
            fill={theme.primary}
            stroke={theme.secondary}
            strokeWidth="1"
          />
          <path
            d="M72 52 Q 78 56 74 64 L 64 58 Z"
            fill={theme.primary}
            stroke={theme.secondary}
            strokeWidth="1"
          />

          {/* Head / helmet — per class */}
          <FighterHead fighterClass={fighterClass} theme={theme} />

          {/* Off-hand arm (behind) */}
          {fighterClass === "juggernaut" ? (
            /* Mecha shield */
            <g>
              <path
                d="M20 66 L32 62 L34 92 L22 96 Z"
                fill={theme.dark}
                stroke={theme.secondary}
                strokeWidth="1.6"
              />
              <path d="M24 72 L30 70 L31 84 L25 86 Z" fill={theme.secondary} opacity="0.5" />
            </g>
          ) : fighterClass === "mage" ? (
            /* Floating lightning orb */
            <g filter={`url(#glow-${fighterClass})`}>
              <circle
                className="sprite-orb"
                cx="22"
                cy="72"
                r="6"
                fill={theme.secondary}
                opacity="0.9"
              />
              <circle cx="22" cy="72" r="9" fill="none" stroke={theme.secondary} strokeWidth="0.8" opacity="0.5" className="sprite-orb-ring" />
            </g>
          ) : (
            /* Off arm */
            <path
              d="M34 58 L26 76 L31 79 L39 62 Z"
              fill={theme.dark}
              stroke={theme.secondary}
              strokeWidth="0.8"
            />
          )}

          {/* Weapon arm + weapon */}
          <g
            className={weaponClass}
            style={{ transformOrigin: "68px 60px", transformBox: "view-box" }}
          >
            {/* Arm */}
            <path
              d="M66 58 L78 72 L73 76 L61 62 Z"
              fill={theme.dark}
              stroke={theme.secondary}
              strokeWidth="0.8"
            />
            <FighterWeapon fighterClass={fighterClass} theme={theme} />
          </g>
        </g>

        {/* ============ STATE VFX ============ */}

        {/* Attack slash arc */}
        {state === "attack" && (
          <>
            <path
              className="sprite-slash"
              d="M64 34 Q 98 70 62 108"
              stroke={theme.secondary}
              strokeWidth="5"
              strokeLinecap="round"
              fill="none"
              opacity="0"
              filter={`url(#glow-${fighterClass})`}
            />
            <path
              className="sprite-slash sprite-slash-trail"
              d="M60 40 Q 90 70 58 102"
              stroke="#ffffff"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
              opacity="0"
            />
          </>
        )}

        {/* Hit sparks + flash */}
        {state === "hit" && (
          <>
            <rect className="sprite-flash" x="0" y="0" width="100" height="140" fill="#ffffff" opacity="0" />
            {[0, 1, 2, 3, 4].map((i) => (
              <circle
                key={i}
                className="sprite-spark"
                style={{ animationDelay: `${i * 45}ms` }}
                cx={54 + (i % 2 === 0 ? 10 : -6)}
                cy={64 + i * 6}
                r={2.2}
                fill={i % 2 === 0 ? "#fca5a5" : "#fde68a"}
              />
            ))}
          </>
        )}

        {/* Second Wind golden/purple shield bubble */}
        {state === "secondWind" && (
          <circle
            className="sprite-shield"
            cx="50"
            cy="72"
            r="34"
            fill="none"
            stroke="#fbbf24"
            strokeWidth="2.5"
            opacity="0"
            filter={`url(#glow-${fighterClass})`}
          />
        )}

        {/* Death impact dust */}
        {state === "dead" && (
          <ellipse className="sprite-dust" cx="50" cy="130" rx="34" ry="6" fill="#a1a1aa" opacity="0" />
        )}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------- per-class parts */

function FighterHead({
  fighterClass,
  theme,
}: {
  fighterClass: FighterClass;
  theme: { primary: string; secondary: string; dark: string };
}) {
  switch (fighterClass) {
    case "berserker":
      return (
        <g>
          {/* Spiky crimson helm */}
          <path
            d="M38 40 L42 30 L46 38 L50 26 L54 38 L58 30 L62 40 L62 54 L38 54 Z"
            fill={theme.primary}
            stroke={theme.secondary}
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
          {/* Visor slit */}
          <rect x="41" y="44" width="18" height="4" rx="1.5" fill="#fef08a" filter={`url(#glow-${fighterClass})`} />
        </g>
      );
    case "samurai":
      return (
        <g>
          {/* Wide kasa hat */}
          <path
            d="M28 42 Q 50 22 72 42 L 68 44 Q 50 34 32 44 Z"
            fill={theme.dark}
            stroke={theme.secondary}
            strokeWidth="1.1"
          />
          {/* Face guard */}
          <path
            d="M42 42 L58 42 L56 54 L44 54 Z"
            fill="#1c1917"
            stroke={theme.secondary}
            strokeWidth="0.8"
          />
          {/* Neon eyes */}
          <line x1="45" y1="47" x2="49" y2="47" stroke={theme.secondary} strokeWidth="1.6" filter={`url(#glow-${fighterClass})`} />
          <line x1="52" y1="47" x2="56" y2="47" stroke={theme.secondary} strokeWidth="1.6" filter={`url(#glow-${fighterClass})`} />
        </g>
      );
    case "mage":
      return (
        <g>
          {/* Hooded cowl */}
          <path
            d="M36 54 L38 36 Q 50 24 62 36 L64 54 Q 50 48 36 54 Z"
            fill={theme.dark}
            stroke={theme.secondary}
            strokeWidth="1"
          />
          {/* Shadowed face */}
          <ellipse cx="50" cy="46" rx="7" ry="6" fill="#0c0a1a" />
          {/* Glowing eyes */}
          <circle cx="47" cy="45" r="1.4" fill={theme.secondary} filter={`url(#glow-${fighterClass})`} />
          <circle cx="53" cy="45" r="1.4" fill={theme.secondary} filter={`url(#glow-${fighterClass})`} />
        </g>
      );
    case "juggernaut":
      return (
        <g>
          {/* Boxy mecha helm */}
          <path
            d="M37 38 L63 38 L65 54 L35 54 Z"
            fill={`url(#armor-${fighterClass})`}
            stroke={theme.secondary}
            strokeWidth="1.2"
          />
          {/* Antenna */}
          <line x1="60" y1="38" x2="64" y2="28" stroke={theme.secondary} strokeWidth="1.4" />
          <circle cx="64" cy="27" r="1.8" fill={theme.secondary} filter={`url(#glow-${fighterClass})`} />
          {/* Visor */}
          <rect x="40" y="43" width="20" height="5" rx="1" fill={theme.secondary} filter={`url(#glow-${fighterClass})`} />
        </g>
      );
  }
}

function FighterWeapon({
  fighterClass,
  theme,
}: {
  fighterClass: FighterClass;
  theme: { primary: string; secondary: string; dark: string };
}) {
  switch (fighterClass) {
    case "berserker":
      /* Giant double battle axe */
      return (
        <g filter={`url(#glow-${fighterClass})`}>
          <rect x="76" y="28" width="3.5" height="52" rx="1.5" fill="#78350f" stroke={theme.secondary} strokeWidth="0.6" />
          <path
            d="M78 30 Q 96 36 86 52 Q 80 46 78 44 Z"
            fill={theme.secondary}
            stroke="#fef3c7"
            strokeWidth="1"
          />
          <path
            d="M78 30 Q 64 36 72 52 Q 77 46 78 44 Z"
            fill={theme.primary}
            stroke={theme.secondary}
            strokeWidth="1"
          />
        </g>
      );
    case "samurai":
      /* Glowing purple katana */
      return (
        <g filter={`url(#glow-${fighterClass})`}>
          <rect x="74" y="66" width="4" height="12" rx="1.5" fill="#292524" />
          <path
            d="M76 66 L74 24 Q 78 22 80 26 L78 66 Z"
            fill="#ede9fe"
            stroke={theme.primary}
            strokeWidth="1.6"
          />
          <line x1="72" y1="66" x2="82" y2="66" stroke={theme.secondary} strokeWidth="2" />
        </g>
      );
    case "mage":
      /* Staff with crackling tip */
      return (
        <g filter={`url(#glow-${fighterClass})`}>
          <rect x="76" y="30" width="3" height="56" rx="1.5" fill="#312e81" stroke={theme.secondary} strokeWidth="0.6" />
          <circle className="sprite-orb" cx="77.5" cy="26" r="5.5" fill={theme.secondary} />
          <path
            d="M74 22 L77 26 L73 28 M81 22 L78 26 L82 28"
            stroke="#fef9c3"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </g>
      );
    case "juggernaut":
      /* Plasma warhammer */
      return (
        <g filter={`url(#glow-${fighterClass})`}>
          <rect x="76" y="34" width="4" height="50" rx="1.5" fill="#334155" stroke={theme.secondary} strokeWidth="0.6" />
          <rect x="68" y="24" width="20" height="14" rx="2.5" fill={theme.dark} stroke={theme.secondary} strokeWidth="1.4" />
          <rect x="70" y="27" width="16" height="4" rx="1" fill={theme.secondary} opacity="0.85" />
        </g>
      );
  }
}
