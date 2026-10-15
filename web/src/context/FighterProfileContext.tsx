"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cn, truncateAddress } from "@/lib/utils";

export type FighterProfile = {
  username: string;
  avatar: string;
  title: string;
};

const STORAGE_KEY = "chog-arena-fighter-profiles-v1";

/** Preset neon-ring avatars (emoji badge + glow color). */
export const AVATARS = [
  { id: "chog", emoji: "🦎", hex: "#84cc16" },
  { id: "reaper", emoji: "💀", hex: "#f43f5e" },
  { id: "frog", emoji: "🐸", hex: "#a855f7" },
  { id: "whale", emoji: "🐋", hex: "#38bdf8" },
  { id: "bolt", emoji: "⚡", hex: "#f59e0b" },
  { id: "katana", emoji: "⚔️", hex: "#fb7185" },
] as const;

/** Preset fighter title badges. */
export const FIGHTER_TITLES = [
  "Arena Executioner",
  "Chog Whale",
  "Second Wind Specialist",
  "High Roller",
  "Duel Forger",
  "Rookie Fighter",
] as const;

/** Demo roster so the lobby looks like a live arcade, not grey 0x icons. */
const DEMO_PROFILES: Record<string, FighterProfile> = {
  "0x4f3a8c2b9e1d7a6f0c5b2d9e8f1a3b4c5d6e7f80": {
    username: "Chogzilla",
    avatar: "chog",
    title: "Chog Whale",
  },
  "0x9b7e4d2c1a8f3e6b0c9d2a5f8e1b4c7d0a3f6e91": {
    username: "MonadReaper",
    avatar: "reaper",
    title: "Arena Executioner",
  },
  "0xd1c47a9b3e6f2c8a0d5b1e4f7a2c9b6e3d8f5a12": {
    username: "KeoneSlayer",
    avatar: "katana",
    title: "Second Wind Specialist",
  },
  "0x77ab3c9f1e4d7a0b5c8e2f6a9d3c0b7e4f1a8d34": {
    username: "0xPurpleFrog",
    avatar: "frog",
    title: "High Roller",
  },
};

type FighterProfileContextValue = {
  /** Stored profile for an address (demo roster included), or null. */
  getProfile: (address?: string | null) => FighterProfile | null;
  /** "Username (0x1234…abcd)" when set, plain "0x1234…abcd" otherwise. */
  getDisplayName: (address?: string | null) => string;
  updateProfile: (address: string, profile: FighterProfile) => void;
};

const FighterProfileContext = createContext<FighterProfileContextValue | null>(
  null,
);

export function FighterProfileProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [profiles, setProfiles] =
    useState<Record<string, FighterProfile>>(DEMO_PROFILES);

  /* Hydrate user overrides from localStorage after mount (SSR-safe). */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as Record<string, FighterProfile>;
        setProfiles({ ...DEMO_PROFILES, ...stored });
      }
    } catch {
      /* corrupted storage — keep demo roster */
    }
  }, []);

  const value = useMemo<FighterProfileContextValue>(
    () => ({
      getProfile: (address) => {
        if (!address) return null;
        return profiles[address.toLowerCase()] ?? null;
      },
      getDisplayName: (address) => {
        if (!address) return "Unknown Fighter";
        const short = truncateAddress(address);
        const profile = profiles[address.toLowerCase()];
        return profile?.username ? `${profile.username} (${short})` : short;
      },
      updateProfile: (address, profile) => {
        const key = address.toLowerCase();
        setProfiles((prev) => {
          const next = { ...prev, [key]: profile };
          try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const stored = raw
              ? (JSON.parse(raw) as Record<string, FighterProfile>)
              : {};
            stored[key] = profile;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
          } catch {
            /* storage full / blocked — in-memory only */
          }
          return next;
        });
      },
    }),
    [profiles],
  );

  return (
    <FighterProfileContext.Provider value={value}>
      {children}
    </FighterProfileContext.Provider>
  );
}

export function useFighterProfile() {
  const ctx = useContext(FighterProfileContext);
  if (!ctx) {
    throw new Error(
      "useFighterProfile must be used within <FighterProfileProvider>",
    );
  }
  return ctx;
}

export function getAvatar(avatarId?: string) {
  return AVATARS.find((a) => a.id === avatarId) ?? AVATARS[0];
}

/** Neon-ringed emoji badge for any fighter address. */
export function FighterAvatarBadge({
  address,
  size = "md",
}: {
  address?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const { getProfile } = useFighterProfile();
  const profile = address ? getProfile(address) : null;
  const avatar = getAvatar(profile?.avatar);
  const sizes = {
    sm: "h-7 w-7 text-sm",
    md: "h-11 w-11 text-xl",
    lg: "h-16 w-16 text-3xl",
  } as const;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl border-2",
        sizes[size],
      )}
      style={{
        borderColor: avatar.hex,
        background: `radial-gradient(circle at 30% 30%, ${avatar.hex}33, transparent 70%), #09090b`,
        boxShadow: `0 0 14px ${avatar.hex}66`,
      }}
      aria-hidden
    >
      {avatar.emoji}
    </span>
  );
}
