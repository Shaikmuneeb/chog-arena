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
import { FIGHTER_CLASS_META, type FighterClass } from "@/config/fighterClasses";
import { SheetFighter } from "./ChogzillaSprite";
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
};

/**
 * Duel lobby with fighter identities (avatar, callsign, title). Polls real
 * ChogArena reads and falls back to the demo roster until deployment.
 * "Accept Challenge" opens the VS matchup modal; own duels can be cancelled
 * to reclaim the staked MON.
 */
export function DuelBoard({ duels, onDuelSettled }: DuelBoardProps) {
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
  const npcDuels: ArenaDuel[] = ARENA_NPCS.map((npc, i) => ({
    id: NPC_DUEL_ID_BASE + i,
    creator: npc.address,
    betAmount: npc.wager,
    status: "open",
    npc,
  }));
  const lobby = liveDuels ?? [];
  const localIds = new Set(duels.map((d) => d.id));
  const merged = [...duels, ...lobby.filter((d) => !localIds.has(d.id))];
  const playerDuels = merged.filter((d) => !d.npc);
  const totalChallengers = playerDuels.length + npcDuels.length;

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold text-zinc-100">
          <Swords className="h-5 w-5 text-rose-400" aria-hidden />
          Duel Lobby
        </h2>
        <span className="text-xs text-zinc-500">
          {totalChallengers} challenger{totalChallengers === 1 ? "" : "s"}
          {!liveDuels && " · arena offline"}
        </span>
      </div>

      {/* ================= SECTION 1 — LIVE PLAYER DUELS ================= */}
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">
          Live Player Duels
        </h3>
        <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
          {playerDuels.length} open
        </span>
        <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" aria-hidden />
      </div>

      {playerDuels.length === 0 ? (
        <div className="mb-6 rounded-2xl border border-dashed border-white/10 bg-zinc-900/40 px-6 py-10 text-center text-sm text-zinc-500">
          No active player duels. Click{" "}
          <span className="font-semibold text-zinc-300">&quot;Create Duel&quot;</span>{" "}
          above to host one!
        </div>
      ) : (
        <ul className="mb-6 space-y-3">
          {playerDuels.map((duel) => (
            <PlayerDuelRow
              key={duel.id}
              duel={duel}
              address={address}
              profileUsername={getProfile(duel.creator)?.username}
              profileTitle={getProfile(duel.creator)?.title}
              profileClass={
                getProfile(duel.creator)?.fighterClass ?? "berserker"
              }
              canceling={cancelingId === duel.id}
              onCancel={() => void cancelDuel(duel)}
              onAccept={() => setActiveDuel(duel)}
            />
          ))}
        </ul>
      )}

      {/* ================= SECTION 2 — ARENA BOT CHALLENGERS ================= */}
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">
          Arena Bot Challengers
        </h3>
        <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
          {npcDuels.length} bots
        </span>
        <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" aria-hidden />
      </div>

      <ul className="space-y-3">
        {npcDuels.map((duel) => (
          <NpcFighterCard
            key={duel.id}
            duel={duel}
            onFight={() => setActiveDuel(duel)}
          />
        ))}
      </ul>

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
  return (
    <li className="group relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 transition-all duration-300 hover:border-purple-500/50 hover:bg-zinc-900/95 hover:shadow-[0_0_28px_-8px_rgba(168,85,247,0.45)]">
      {/* Class-tinted top edge */}
      <div
        className="absolute inset-x-0 top-0 h-px opacity-70"
        style={{
          background: `linear-gradient(90deg, transparent, ${classMeta.secondary}, transparent)`,
        }}
        aria-hidden
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* LEFT — animated avatar, class tag, fighter title */}
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="sprite-pixelated shrink-0 rounded-xl border border-white/10 bg-black/60 px-1 pt-1 transition-transform duration-300 group-hover:scale-105"
            style={{ boxShadow: `0 0 16px ${classMeta.primary}44` }}
          >
            <SheetFighter fighterClass={npc.fighterClass} state="idle" size={56} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-zinc-100">{npc.name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
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
            </div>
          </div>
        </div>

        {/* CENTER — glowing gold/violet stake badge */}
        <div className="flex shrink-0 flex-col items-center rounded-xl border border-amber-400/30 bg-gradient-to-b from-amber-500/15 to-violet-600/10 px-4 py-1.5 shadow-[0_0_18px_-4px_rgba(251,191,36,0.45)] transition-shadow duration-300 group-hover:shadow-[0_0_24px_-2px_rgba(251,191,36,0.65)]">
          <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-amber-200/70">
            Stake
          </span>
          <span className="font-mono text-base font-black tabular-nums text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]">
            {formatMon(duel.betAmount)}
            <span className="ml-1 text-xs font-bold text-amber-200/80">MON</span>
          </span>
        </div>

        {/* RIGHT — high-impact action button */}
        <button
          type="button"
          onClick={onFight}
          className="shrink-0 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-rose-600/25 transition-all duration-300 hover:scale-105 hover:from-rose-500 hover:to-pink-500 active:scale-95"
        >
          ⚡ Fight NPC
        </button>
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
