import type { Config } from "tailwindcss";

/**
 * Chog Arena — cyberpunk Web3 design tokens.
 *
 * The palette is deliberately tiny: deep OLED blacks, one purple anchor,
 * one neon pink accent and a cyan signal colour for live/on-chain state.
 * Every surface is a translucent glass panel; every accent border glows.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        /* Chakra Petch — angular, engineered display face. */
        display: [
          "var(--font-chakra)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        /* JetBrains Mono — every number, address and stat readout. */
        mono: [
          "var(--font-jetbrains)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      colors: {
        neon: {
          pink: "#ff2fb9",
          purple: "#a855f7",
          violet: "#7c3aed",
          cyan: "#22d3ee",
          lime: "#a3e635",
        },
      },
      boxShadow: {
        /* Ambient lift for glass panels. */
        glass:
          "inset 0 1px 0 0 rgba(255,255,255,0.07), 0 24px 60px -32px rgba(168,85,247,0.55)",
        /* Neon rim glows. */
        "glow-purple": "0 0 26px -6px rgba(168,85,247,0.85)",
        "glow-pink": "0 0 26px -6px rgba(255,47,185,0.8)",
        "glow-cyan": "0 0 22px -6px rgba(34,211,238,0.8)",
        "glow-amber": "0 0 22px -6px rgba(251,191,36,0.7)",
        /* Hard-edged neon underline for primary CTAs. */
        "neon-edge":
          "0 0 0 1px rgba(217,70,239,0.35), 0 0 22px -4px rgba(217,70,239,0.65), 0 12px 40px -18px rgba(217,70,239,0.7)",
      },
      keyframes: {
        /* Slow, irregular breathing on neon rims. */
        "neon-breathe": {
          "0%, 100%": {
            boxShadow:
              "0 0 0 1px rgba(217,70,239,0.28), 0 0 20px -8px rgba(217,70,239,0.55)",
          },
          "50%": {
            boxShadow:
              "0 0 0 1px rgba(236,72,153,0.55), 0 0 34px -6px rgba(236,72,153,0.85)",
          },
        },
        /* A single bar of light travelling along a panel's top edge. */
        "edge-sweep": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(200%)" },
        },
        /* Backdrop grid drift — barely perceptible, keeps the page alive. */
        "grid-drift": {
          "0%": { backgroundPosition: "0 0" },
          "100%": { backgroundPosition: "44px 44px" },
        },
        /* Text glow for hero headlines. */
        "text-glow": {
          "0%, 100%": { opacity: "0.85" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "neon-breathe": "neon-breathe 3.4s ease-in-out infinite",
        "edge-sweep": "edge-sweep 3.6s linear infinite",
        "grid-drift": "grid-drift 9s linear infinite",
        "text-glow": "text-glow 4.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
