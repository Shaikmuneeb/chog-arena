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
import {
  migrateFighterClass,
  type FighterClass,
} from "@/config/fighterClasses";
import { ARENA_NPCS } from "@/config/arenaNpcs";

export type { FighterClass };

export type FighterProfile = {
  username: string;
  /** Custom avatar image: uploaded data URL or external http(s)/ipfs link. */
  avatarUrl: string;
  title: string;
  /** Full-body fighter class used by the sprite rig + battle stage. */
  fighterClass: FighterClass;
};

/* v2: avatar field changed from preset emoji id to custom image URL. */
const STORAGE_KEY = "chog-arena-fighter-profiles-v2";

/** Preset fighter title badges. */
export const FIGHTER_TITLES = [
  "Arena Executioner",
  "Chog Whale",
  "Second Wind Specialist",
  "High Roller",
  "Duel Forger",
  "Rookie Fighter",
] as const;

type FighterProfileContextValue = {
  /** Stored profile for an address, or null. */
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
  const [profiles, setProfiles] = useState<Record<string, FighterProfile>>({});

  /* Hydrate profiles from localStorage after mount (SSR-safe), with the
   * Arena NPC roster always present underneath. */
  useEffect(() => {
    let stored: Record<string, FighterProfile> = {};
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, Partial<FighterProfile>>;
        for (const [key, value] of Object.entries(parsed)) {
          stored[key] = {
            username: typeof value.username === "string" ? value.username : "",
            avatarUrl: typeof value.avatarUrl === "string" ? value.avatarUrl : "",
            title: typeof value.title === "string" ? value.title : "",
            /* Class renames migrate stored profiles. */
            fighterClass: migrateFighterClass(value.fighterClass),
          };
        }
      }
    } catch {
      /* corrupted storage — start empty */
    }
    const npcProfiles: Record<string, FighterProfile> = {};
    for (const npc of ARENA_NPCS) {
      npcProfiles[npc.address.toLowerCase()] = {
        username: npc.name,
        avatarUrl: "",
        title: npc.title,
        fighterClass: npc.fighterClass,
      };
    }
    setProfiles({ ...npcProfiles, ...stored });
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
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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

/** Word initials ("Keone void_lord_james" → "KM"), else first 2 letters / 2 hex chars. */
function getInitials(
  username?: string,
  address?: string | null,
): string {
  if (username && username.length > 0) {
    const words = username.trim().split(/\s+/);
    if (words.length >= 2 && words[0] && words[1]) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return username.slice(0, 2).toUpperCase();
  }
  if (address) return address.slice(2, 4).toUpperCase();
  return "??";
}

/** Deterministic neon hue per address for the fallback ring. */
function fallbackHue(address?: string | null): number {
  if (!address) return 280;
  return parseInt(address.slice(2, 8), 16) % 360;
}

/**
 * Fighter avatar: custom image inside a neon ring, with an initials +
 * gradient fallback when no image is set or the image fails to load.
 */
export function FighterAvatarBadge({
  address,
  size = "md",
}: {
  address?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const { getProfile } = useFighterProfile();
  const profile = address ? getProfile(address) : null;
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [profile?.avatarUrl]);

  const initials = getInitials(profile?.username, address);
  const hex = `hsl(${fallbackHue(address)} 75% 55%)`;
  const sizes = {
    sm: "h-7 w-7 text-[9px]",
    md: "h-11 w-11 text-xs",
    lg: "h-16 w-16 text-lg",
    xl: "h-24 w-24 text-3xl",
  } as const;

  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border-2",
        sizes[size],
      )}
      style={{
        borderColor: hex,
        background: `radial-gradient(circle at 30% 30%, ${hex}33, transparent 70%), #09090b`,
        boxShadow: `0 0 14px ${hex}66`,
      }}
      aria-hidden
    >
      {profile?.avatarUrl && !imgFailed ? (
        <img
          src={profile.avatarUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span className="font-extrabold tracking-tight text-zinc-100">
          {initials}
        </span>
      )}
    </span>
  );
}
