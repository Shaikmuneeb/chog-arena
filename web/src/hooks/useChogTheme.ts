"use client";

import { useSyncExternalStore } from "react";
import {
  getChogThemeServerSnapshot,
  getChogThemeSnapshot,
  subscribeChogTheme,
  type ChogThemeSnapshot,
} from "@/lib/chogTheme";

/**
 * The live state of the Chog theme track.
 *
 * The track is owned by a module level element rather than by React, so its
 * state is read through an external store. The server snapshot is what the
 * server renders - the browser swaps in the real state once it hydrates.
 */
export function useChogTheme(): ChogThemeSnapshot {
  return useSyncExternalStore(
    subscribeChogTheme,
    getChogThemeSnapshot,
    getChogThemeServerSnapshot,
  );
}
