"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useChainId,
  useConfig,
  useWriteContract,
} from "wagmi";
import { readContract, waitForTransactionReceipt } from "wagmi/actions";
import { zeroAddress } from "viem";
import { Swords } from "lucide-react";
import {
  CHOG_ARENA_ADDRESS,
  chogArenaAbi,
} from "@/contracts";
import {
  isMonadChainId,
  monad,
  monadTestnet,
} from "@/config/monadChain";
import {
  FighterAvatarBadge,
  useFighterProfile,
} from "@/context/FighterProfileContext";
import {
  ARENA_NPCS,
  NPC_DUEL_ID_BASE,
  type ArenaNpc,
} from "@/config/arenaNpcs";
import {
  FIGHTER_CLASS_META,
  FIGHTER_ROSTER_BY_ID,
  type FighterClass,
  type FighterRosterEntry,
} from "@/config/fighterClasses";
import { BATTLE_ROSTER } from "@/config/fighterModels";
import { cn, formatMon, truncateAddress } from "@/lib/utils";
import { pushToast } from "./Toast";
import { AcceptDuelModal } from "./AcceptDuelModal";

export type ArenaDuel = {
  id: number;
  creator: `0x${string}`;
  betAmount: bigint;
  status: "open" | "settling";
  /** true when the connected player opened this duel */
  mine?: boolean;
  /** Arena NPC challenger (demo opponent with its own fighter class). */
  npc?: ArenaNpc;
  /** Static roster entry bound to this duel (id, asset, price). */
  rosterEntry?: FighterRosterEntry;
};

const ZERO = zeroAddress;

type DuelRow = readonly [
  `0x${string}`,
  `0x${string}`,
  bigint,
  `0x${string}`,
  boolean,
  boolean,
];

type DuelBoardProps = {
  duels: ArenaDuel[];
  onDuelSettled: (duelId: number) => void;
  onCreateDuel?: () => void;
  /**
   * The character ids that make up the arena roster. Each id resolves to its
   * own challenger, asset and price — the grid never reuses a card.
   */
  roster?: readonly FighterClass[];
};

/**
 * Duel lobby with fighter identities (avatar, callsign, title). Polls real
 * ChogArena reads and falls back to the demo roster until deployment.
 * "Accept Challenge" opens the VS matchup modal; own duels can be cancelled
 * to reclaim the staked MON.
 */
export function DuelBoard({
  duels,
  onDuelSettled,
  onCreateDuel,
  roster = BATTLE_ROSTER,
}: DuelBoardProps) {
  const config = useConfig();
  const { address, chainId: walletChainId } = useAccount();
  const appChainId = useChainId();
  const chainId = walletChainId ?? appChainId;
  const { getProfile } = useFighterProfile();
  const { writeContractAsync } = useWriteContract();
  const [liveDuels, setLiveDuels] = useState<ArenaDuel[] | null>(null);
  const [activeDuel, setActiveDuel] = useState<ArenaDuel | null>(null);
  const [cancelingId, setCancelingId] = useState<number | null>(null);

  /* Live lobby poll — silently keeps the demo board on failure. */
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const counter = await readContract(config, {
          address: CHOG_ARENA_ADDRESS,
          abi: chogArenaAbi,
          functionName: "duelCounter",
        });
        const total = Number(counter as bigint);
        const open: ArenaDuel[] = [];
        for (let i = 1; i <= Math.min(total, 25); i++) {
          const d = (await readContract(config, {
            address: CHOG_ARENA_ADDRESS,
            abi: chogArenaAbi,
            functionName: "duels",
            args: [BigInt(i)],
          })) as DuelRow;
          if (d[1] === ZERO && !d[4] && d[2] > 0n) {
            open.push({ id: i, creator: d[0], betAmount: d[2], status: "open" });
          }
        }
        if (!cancelled) setLiveDuels(open);
      } catch {
        /* not deployed — stay on demo data */
      }
    }
    load();
    const interval = setInterval(load, 20_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [config]);

  async function cancelDuel(duel: ArenaDuel) {
    if (!isMonadChainId(chainId)) {
      pushToast({
        kind: "error",
        message: "Switch to the Monad network to cancel a duel",
      });
      return;
    }
    setCancelingId(duel.id);
    try {
      const hash = await writeContractAsync({
        chainId: chainId === monadTestnet.id ? monadTestnet.id : monad.id,
        address: CHOG_ARENA_ADDRESS,
        abi: chogArenaAbi,
        functionName: "cancelDuel",
        args: [BigInt(duel.id)],
      });
      await waitForTransactionReceipt(config, { hash });
      pushToast({ kind: "success", message: "Duel cancelled — stake refunded" });
      onDuelSettled(duel.id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message.toLowerCase() : "";
      if (message.includes("reject")) {
        pushToast({ kind: "error", message: "Cancellation rejected in wallet" });
      } else {
        // Demo mode (contract not deployed) — cancel locally.
        pushToast({
          kind: "success",
          message: "Duel cancelled (demo — contract not deployed)",
        });
        onDuelSettled(duel.id);
      }
    } finally {
      setCancelingId(null);
    }
  }

  // Arena NPC challengers + local optimistic entries + live on-chain
  // duels (deduped by id). NPCs and player duels render in SEPARATE
  // sections — never mixed into one list.
  // Each roster id resolves to its challenger BY CHARACTER ID, so a card
  // always shows the asset + price bound to that exact fighter.
  const npcDuels: ArenaDuel[] = roster.flatMap((id): ArenaDuel[] => {
    const npc = ARENA_NPCS.find((n) => n.fighterClass === id);
    if (!npc) return [];
    const entry: FighterRosterEntry = FIGHTER_ROSTER_BY_ID[id];
    return [
      {
        /* Duel id derives from the fighter's own on-chain npcId, never from
         * its position in the array — reordering never remaps a duel. */
        id: NPC_DUEL_ID_BASE + npc.npcId,
        creator: npc.address,
        betAmount: npc.wager,
        status: "open",
        npc,
        rosterEntry: entry,
      },
    ];
  });
  const lobby = liveDuels ?? [];
  const localIds = new Set(duels.map((d) => d.id));
  const merged = [...duels, ...lobby.filter((d) => !localIds.has(d.id))];
  const playerDuels = merged.filter((d) => !d.npc);
  const totalChallengers = playerDuels.length + npcDuels.length;

  return (
    <section className="space-y-6">
      {/* Compact Live PvP strip */}
      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">
            Open PVP Challenges
          </span>
          <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
            {playerDuels.length}
          </span>
          {!liveDuels && (
            <span className="text-[10px] text-zinc-500">· arena offline</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onCreateDuel?.()}
          className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-500"
        >
          + Create Open Duel
        </button>
      </div>

      {playerDuels.length > 0 && (
        <ul className="space-y-2">
          {playerDuels.map((duel) => (
            <PlayerDuelRow
              key={duel.id}
              duel={duel}
              address={address}
              profileUsername={getProfile(duel.creator)?.username}
              profileTitle={getProfile(duel.creator)?.title}
              profileClass={
                getProfile(duel.creator)?.fighterClass ?? "chogzila"
              }
              canceling={cancelingId === duel.id}
              onCancel={() => void cancelDuel(duel)}
              onAccept={() => setActiveDuel(duel)}
            />
          ))}
        </ul>
      )}

      {/* Arcade roster grid — renders the static roster objects directly,
          keyed by character id so React never re-orders a fighter's asset. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {npcDuels.map((duel) => (
          <NpcFighterCard
            key={duel.rosterEntry?.id ?? duel.id}
            duel={duel}
            onFight={() => setActiveDuel(duel)}
          />
        ))}
      </div>

      <AcceptDuelModal
        duel={activeDuel}
        onClose={() => setActiveDuel(null)}
        onSettled={onDuelSettled}
      />
    </section>
  );
}

/* ------------------------------------------------------- NPC fighter card */

/**
 * Premium arcade fighter card for Arena Bot challengers: mini-canvas
 * avatar + class tag + title (left), glowing stake badge (center),
 * high-impact Fight NPC button (right). Name shown exactly once.
 */
const FIGHTER_STYLE: Record<string, string> = {
  crimson_lord_benja: "Bloodline Overlord • Aggressive",
  lady_chog: "Royal Duelist • Technical",
  chog_princess: "Astral Sovereign • Magic",
  chog_samurai: "Blade Saint • Fast",
  void_lord_james: "Void Sovereign • Heavy",
  chogzila: "Apex Predator • Power",
};

function NpcFighterCard({
  duel,
  onFight,
}: {
  duel: ArenaDuel;
  onFight: () => void;
}) {
  const npc = duel.npc;
  if (!npc) return null;
  const classMeta = FIGHTER_CLASS_META[npc.fighterClass];
  const style = FIGHTER_STYLE[npc.fighterClass] ?? npc.title;
  /* The roster entry owns this card's identity: its own asset, its own
   * name and its own hardcoded price. Never derived from a neighbour. */
  const entry = duel.rosterEntry;
  const portraitSrc = entry?.image ?? classMeta.portrait;
  const displayName = entry?.name ?? npc.name;
  const priceLabel = entry?.price ?? `${formatMon(duel.betAmount)} MON`;
  return (
    <li className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] transition-all duration-300 hover:border-purple-500/50 hover:bg-white/[0.04] hover:shadow-[0_0_28px_-8px_rgba(168,85,247,0.45)]">
      {/* Class-tinted top edge */}
      <div
        className="absolute inset-x-0 top-0 h-px opacity-70"
        style={{
          background: `linear-gradient(90deg, transparent, ${classMeta.secondary}, transparent)`,
        }}
        aria-hidden
      />
  {/* Portrait — transparent, no panel behind the character */}
  <div className="relative aspect-[4/5] overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center transition-transform duration-300 group-hover:scale-125">
          <img
           src={portraitSrc}
           alt=""
           aria-hidden
           draggable={false}
           className="fighter-portrait scale-110"
           style={{ height: 190, width: "auto" }}
         />
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4">
        <p className="text-xl font-black uppercase tracking-wider text-white">
          {displayName}
        </p>
        <div className="mt-1 flex items-center justify-between">
          <span className="font-mono text-sm font-black tabular-nums text-amber-300">
            {priceLabel}
          </span>
          <button
            type="button"
            onClick={onFight}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white opacity-0 shadow-lg shadow-rose-600/30 transition-all duration-300 group-hover:opacity-100 hover:bg-rose-500"
          >
            CHALLENGE
          </button>
        </div>
      </div>
    </li>
  );
}

/* ------------------------------------------------------ player duel row */

/** Glassmorphism row for live on-chain / local player duels. */
function PlayerDuelRow({
  duel,
  address,
  profileUsername,
  profileTitle,
  profileClass,
  canceling,
  onCancel,
  onAccept,
}: {
  duel: ArenaDuel;
  address?: `0x${string}`;
  profileUsername?: string;
  profileTitle?: string;
  profileClass: FighterClass;
  canceling: boolean;
  onCancel: () => void;
  onAccept: () => void;
}) {
  const isMine =
    address != null && duel.creator.toLowerCase() === address.toLowerCase();
  const classMeta = FIGHTER_CLASS_META[profileClass];
  return (
    <li className="group relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 transition-all duration-300 hover:border-purple-500/50 hover:bg-zinc-900/95 hover:shadow-[0_0_28px_-8px_rgba(168,85,247,0.35)]">
      <div
        className="absolute inset-x-0 top-0 h-px opacity-60"
        style={{
          background: `linear-gradient(90deg, transparent, ${classMeta.secondary}, transparent)`,
        }}
        aria-hidden
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <FighterAvatarBadge address={duel.creator} size="md" />
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-zinc-100">
              {profileUsername ?? truncateAddress(duel.creator)}
              <span
                className="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                style={{
                  borderColor: `${classMeta.secondary}55`,
                  color: classMeta.secondary,
                  backgroundColor: `${classMeta.primary}22`,
                }}
              >
                {classMeta.label}
              </span>
              {isMine && (
                <span className="rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-semibold text-purple-300">
                  YOUR DUEL
                </span>
              )}
            </p>
            <p className="mt-0.5 font-mono text-xs text-zinc-500">
              {truncateAddress(duel.creator)} · Duel #{duel.id}
              {profileTitle ? ` · ${profileTitle}` : ""}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {/* Glowing stake badge */}
          <div className="flex flex-col items-center rounded-xl border border-amber-400/30 bg-gradient-to-b from-amber-500/15 to-violet-600/10 px-3 py-1.5 shadow-[0_0_18px_-4px_rgba(251,191,36,0.45)]">
            <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-amber-200/70">
              Stake
            </span>
            <span className="font-mono text-sm font-black tabular-nums text-amber-300">
              {formatMon(duel.betAmount)}
              <span className="ml-1 text-[10px] font-bold text-amber-200/80">MON</span>
            </span>
          </div>

          {isMine ? (
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-purple-400/30 bg-purple-500/10 px-3 py-1.5 text-xs font-semibold text-purple-200">
                Waiting…
              </span>
              <button
                type="button"
                onClick={onCancel}
                disabled={canceling}
                className={cn(
                  "rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold transition",
                  canceling
                    ? "cursor-wait text-zinc-500"
                    : "text-zinc-300 hover:border-red-400/40 hover:text-red-300",
                )}
              >
                {canceling ? "Cancelling…" : "Cancel"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onAccept}
              className="rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-rose-600/25 transition-all duration-300 hover:scale-105 hover:from-rose-500 hover:to-pink-500 active:scale-95"
            >
              Accept Challenge
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
