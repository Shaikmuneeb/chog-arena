"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface FighterControls {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  punch: boolean;
  kick: boolean;
  special: boolean;
  block: boolean;
}

const DEFAULT_CONTROLS: FighterControls = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  punch: false,
  kick: false,
  special: false,
  block: false,
};

/**
 * Arcade & Keyboard controller hook for 3D and 2D fighter movement and combat.
 * Supports:
 * - Movement: WASD / Arrow Keys (forward/backward/left/right)
 * - Attacks: J (Punch), K (Kick), L (Special), U (Block), Space (Punch)
 * - Virtual / On-screen triggers for mobile & touch arcade inputs
 */
export function useControls(): FighterControls & {
  triggerPunch: () => void;
  triggerKick: () => void;
  triggerSpecial: () => void;
  setControlState: (key: keyof FighterControls, active: boolean) => void;
} {
  const [controls, setControls] = useState<FighterControls>(DEFAULT_CONTROLS);
  const controlsRef = useRef<FighterControls>(DEFAULT_CONTROLS);

  const updateControl = useCallback((key: keyof FighterControls, value: boolean) => {
    controlsRef.current = { ...controlsRef.current, [key]: value };
    setControls((prev) => ({ ...prev, [key]: value }));
  }, []);

  const triggerPunch = useCallback(() => {
    updateControl("punch", true);
    setTimeout(() => {
      updateControl("punch", false);
    }, 180);
  }, [updateControl]);

  const triggerKick = useCallback(() => {
    updateControl("kick", true);
    setTimeout(() => {
      updateControl("kick", false);
    }, 220);
  }, [updateControl]);

  const triggerSpecial = useCallback(() => {
    updateControl("special", true);
    setTimeout(() => {
      updateControl("special", false);
    }, 300);
  }, [updateControl]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const trackedCodes = [
        "KeyW", "KeyS", "KeyA", "KeyD",
        "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
        "KeyJ", "KeyK", "KeyL", "KeyU", "Space"
      ];
      if (trackedCodes.includes(e.code) && !e.metaKey && !e.ctrlKey) {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag !== "input" && tag !== "textarea") {
          e.preventDefault();
        }
      }

      switch (e.code) {
        case "KeyW":
        case "ArrowUp":
          updateControl("forward", true);
          break;
        case "KeyS":
        case "ArrowDown":
          updateControl("backward", true);
          break;
        case "KeyA":
        case "ArrowLeft":
          updateControl("left", true);
          break;
        case "KeyD":
        case "ArrowRight":
          updateControl("right", true);
          break;
        case "KeyJ":
        case "Space":
          updateControl("punch", true);
          break;
        case "KeyK":
          updateControl("kick", true);
          break;
        case "KeyL":
          updateControl("special", true);
          break;
        case "KeyU":
          updateControl("block", true);
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case "KeyW":
        case "ArrowUp":
          updateControl("forward", false);
          break;
        case "KeyS":
        case "ArrowDown":
          updateControl("backward", false);
          break;
        case "KeyA":
        case "ArrowLeft":
          updateControl("left", false);
          break;
        case "KeyD":
        case "ArrowRight":
          updateControl("right", false);
          break;
        case "KeyJ":
        case "Space":
          updateControl("punch", false);
          break;
        case "KeyK":
          updateControl("kick", false);
          break;
        case "KeyL":
          updateControl("special", false);
          break;
        case "KeyU":
          updateControl("block", false);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [updateControl]);

  return {
    ...controls,
    triggerPunch,
    triggerKick,
    triggerSpecial,
    setControlState: updateControl,
  };
}
