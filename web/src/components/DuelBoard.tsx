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
import { FIGHTER_CLASS_META } from "@/config/fighterClasses";
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
  // duels (deduped by id).
  const npcDuels: ArenaDuel[] = ARENA_NPCS.map((npc, i) => ({
    id: NPC_DUEL_ID_BASE + i,
    creator: npc.address,
    betAmount: npc.wager,
    status: "open",
    npc,
  }));
  const lobby = liveDuels ?? [];
  const localIds = new Set(duels.map((d) => d.id));
  const rows = [
    ...npcDuels,
    ...duels,
    ...lobby.filter((d) => !localIds.has(d.id)),
  ];

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold text-zinc-100">
          <Swords className="h-5 w-5 text-rose-400" aria-hidden />
          Duel Lobby
        </h2>
        <span className="text-xs text-zinc-500">
          {rows.length} challenger{rows.length === 1 ? "" : "s"}
          {!liveDuels && " · arena offline"}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-zinc-900/40 px-6 py-12 text-center text-sm text-zinc-500">
          No open duels. Forge one to enter the arena — only real challenges
          appear here.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((duel) => {
            const profile = getProfile(duel.creator);
            // Ownership follows the CONNECTED wallet — never the stale
            // `mine` flag from creation time, which used to lock other
            // wallets out of the Accept button.
            const isMine =
              address != null &&
              duel.creator.toLowerCase() === address.toLowerCase();
            const fighterClass =
              duel.npc?.fighterClass ?? profile?.fighterClass ?? "berserker";
            const classMeta = FIGHTER_CLASS_META[fighterClass];
            return (
              <li
                key={duel.id}
                className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/70 px-5 py-4 transition hover:border-white/20"
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-4">
                    <FighterAvatarBadge address={duel.creator} size="md" />
                    {/* Mini full-body fighter preview */}
                    <div
                      className="hidden shrink-0 rounded-xl border border-white/10 bg-black/50 px-1 sm:block"
                      style={{ boxShadow: `0 0 14px ${classMeta.primary}33` }}
                    >
                    <SheetFighter
                      fighterClass={fighterClass}
                      state="idle"
                      size={64}
                    />
                    </div>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-zinc-100">
                        {duel.npc?.name ?? profile?.username ?? truncateAddress(duel.creator)}
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
                        {(duel.npc?.title || profile?.title) && (
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-zinc-300">
                            {duel.npc?.title ?? profile?.title}
                          </span>
                        )}
                        {isMine && (
                          <span className="rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-semibold text-purple-300">
                            YOUR DUEL
                          </span>
                        )}
                        {duel.npc && (
                          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                            ARENA NPC
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-zinc-500">
                        {duel.npc
                          ? `${duel.npc.name}`
                          : truncateAddress(duel.creator)}
                        {" · "}
                        {duel.npc ? "NPC Duel" : `Duel #${duel.id}`} ·{" "}
                        <span className="font-semibold text-amber-200">
                          {formatMon(duel.betAmount)} MON
                        </span>{" "}
                        on the line
                      </p>
                    </div>
                  </div>

                  {isMine ? (
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-purple-400/30 bg-purple-500/10 px-3 py-1.5 text-xs font-semibold text-purple-200">
                        Waiting…
                      </span>
                      <button
                        type="button"
                        onClick={() => void cancelDuel(duel)}
                        disabled={cancelingId === duel.id}
                        className={cn(
                          "rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold transition",
                          cancelingId === duel.id
                            ? "cursor-wait text-zinc-500"
                            : "text-zinc-300 hover:border-red-400/40 hover:text-red-300",
                        )}
                      >
                        {cancelingId === duel.id ? "Cancelling…" : "Cancel"}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveDuel(duel)}
                      className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-600/20 transition hover:bg-rose-500"
                    >
                      {duel.npc ? "⚔️ Fight NPC" : "Accept Challenge"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AcceptDuelModal
        duel={activeDuel}
        onClose={() => setActiveDuel(null)}
        onSettled={onDuelSettled}
      />
    </section>
  );
}
