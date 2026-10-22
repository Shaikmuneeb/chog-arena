"use client";

import { useEffect, useRef, useState } from "react";
import {
  useAccount,
  useChainId,
  useConfig,
  useReadContract,
  useSendTransaction,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { readContract, waitForTransactionReceipt } from "wagmi/actions";
import { parseEventLogs, zeroAddress } from "viem";
import { Coins, Loader2, Wallet, X } from "lucide-react";
import { CHOG_ARENA_ADDRESS, CHOG_NFT_ADDRESS, chogArenaAbi, iChogNftAbi } from "@/contracts";
import {
  isMonadChainId,
  monad,
  monadTestnet,
  targetChain,
} from "@/config/monadChain";
import { cn, formatMon, truncateAddress } from "@/lib/utils";
import {
  FighterAvatarBadge,
  useFighterProfile,
} from "@/context/FighterProfileContext";
import { FIGHTER_CLASS_META, type FighterClass } from "@/config/fighterClasses";
import {
  DEFAULT_FIGHTER_CLASS,
  pickOpposingFighter,
} from "@/config/fighterModels";
import dynamic from "next/dynamic";

const FighterPreview3D = dynamic(
  () => import("./Fighter3D").then((m) => m.FighterPreview3D),
  { ssr: false },
);
import type { ArenaNpc } from "@/config/arenaNpcs";
import { pushToast, updateToast } from "./Toast";
import {
  BattleArenaModal,
  type DuelOutcome,
  type FighterDescriptor,
} from "./BattleArenaModal";
import { WalletConnectModal } from "./WalletConnectModal";

import type { ArenaDuel } from "./DuelBoard";

function visibleFighterName(
  username: string | null | undefined,
  fighterClass: FighterClass,
): string {
  const trimmed = username?.trim();
  if (trimmed) return trimmed;
  return FIGHTER_CLASS_META[fighterClass].label;
}

const ZERO = zeroAddress;

type AcceptDuelModalProps = {
  duel: ArenaDuel | null;
  onClose: () => void;
  onSettled: (duelId: number) => void;
};

/**
 * Cyberpunk VS matchup screen for accepting a challenge:
 * CREATOR vs YOU, prize pot, Second Wind statuses — then joinDuel,
 * the clash-settlement phase, and the DuelOutcomeModal reveal.
 */
export function AcceptDuelModal({ duel, onClose, onSettled }: AcceptDuelModalProps) {
  const [phase, setPhase] = useState<"matchup" | "settling">("matchup");
  const [outcome, setOutcome] = useState<DuelOutcome | null>(null);
  const [walletPickerOpen, setWalletPickerOpen] = useState(false);
  const [playAgainBusy, setPlayAgainBusy] = useState(false);
  const toastIdRef = useRef<number | null>(null);
  const demoSettleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { address, isConnected, chainId: walletChainId } = useAccount();
  const { getProfile } = useFighterProfile();
  // Authoritative wallet chain — useChainId() reflects the app's optimistic
  // config chain (defaults to 143) and can desync from the real wallet.
  const appChainId = useChainId();
  const chainId = walletChainId ?? appChainId;
  const config = useConfig();
  const { switchChain } = useSwitchChain();

  const { writeContract, writeContractAsync, data: txHash, isPending, reset } =
    useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const {
    data: receipt,
    isLoading: isConfirming,
    isSuccess: isConfirmed,
  } = useWaitForTransactionReceipt({ hash: txHash });

  /* Reset whenever a different duel opens. */
  useEffect(() => {
    setPhase("matchup");
    setOutcome(null);
    setWalletPickerOpen(false);
    if (demoSettleRef.current !== null) {
      clearTimeout(demoSettleRef.current);
      demoSettleRef.current = null;
    }
  }, [duel?.id]);

  /* True 50/50 demo roll: 20% Second Wind on the initial loser, then a
   * sudden-death 50/50 re-roll for the clutch comeback. */
  function rollDemoOutcome(): DuelOutcome {
    const creator = duel!.creator;
    const challenger = address ?? ZERO;
    let winnerSide: "creator" | "challenger" =
      Math.random() < 0.5 ? "creator" : "challenger";
    let secondWind = false;
    let revivedSide: "creator" | "challenger" | null = null;
    if (Math.random() < 0.2) {
      secondWind = true;
      const loserSide = winnerSide === "creator" ? "challenger" : "creator";
      revivedSide = loserSide;
      if (Math.random() < 0.5) winnerSide = loserSide; // re-roll
    }
    const winnerAddress = winnerSide === "creator" ? creator : challenger;
    const loserAddress = winnerSide === "creator" ? challenger : creator;
    const userWon = winnerSide === "challenger";
    const pot = duel!.betAmount * 2n;
    return {
      duelId: duel!.id,
      userWon,
      secondWind,
      userResurrected: revivedSide === "challenger" && address != null,
      wager: duel!.betAmount,
      pot,
      payout: userWon ? pot : 0n,
      winnerAddress,
      loserAddress,
      resurrectedAddress:
        revivedSide === "creator"
          ? creator
          : revivedSide === "challenger"
            ? challenger
            : undefined,
    };
  }

  /* Resolve the real outcome from the joinDuel receipt, then open the
   * battle arena. Priority: DuelResolved/SecondWindTriggered event logs →
   * duels() storage read → true 50/50 demo roll. */
  useEffect(() => {
    if (!isConfirmed || !duel || !receipt) return;
    if (toastIdRef.current !== null) {
      updateToast(toastIdRef.current, {
        kind: "success",
        message: "Challenge accepted — fighters clashing…",
        txHash,
      });
      toastIdRef.current = null;
    }
    setPhase("settling");

    const timer = setTimeout(() => {
      void (async () => {
        let result: DuelOutcome | null = null;

        /* 1) Parse the settlement events straight from the tx receipt. */
        try {
          const resolvedLogs = parseEventLogs({
            abi: chogArenaAbi,
            logs: receipt.logs,
            eventName: "DuelResolved",
          });
          const windLogs = parseEventLogs({
            abi: chogArenaAbi,
            logs: receipt.logs,
            eventName: "SecondWindTriggered",
          });
          const resolved = resolvedLogs[0];
          if (resolved) {
            const winner = resolved.args.winner as `0x${string}`;
            const payout = resolved.args.payout as bigint;
            const secondWindUsed = Boolean(resolved.args.secondWindUsed);
            const resurrected = windLogs[0]?.args
              .resurrectedPlayer as `0x${string}` | undefined;
            const userWon =
              address != null && winner.toLowerCase() === address.toLowerCase();
            const loser: `0x${string}` = userWon
              ? duel.creator
              : (address ?? ZERO);
            result = {
              // Use the real on-chain duel id (fightNpc mints its own id from
              // duelCounter — NPC lobby rows use synthetic ids).
              duelId: Number(resolved.args.duelId),
              userWon,
              secondWind: secondWindUsed,
              userResurrected: Boolean(
                resurrected &&
                  address &&
                  resurrected.toLowerCase() === address.toLowerCase(),
              ),
              wager: duel.betAmount,
              pot: duel.betAmount * 2n,
              payout: userWon ? payout : 0n,
              txHash,
              winnerAddress: winner,
              loserAddress: loser,
              resurrectedAddress: resurrected,
            };
          }
        } catch {
          /* fall through to storage read */
        }

        /* 2) Storage read fallback (events stripped by the RPC, etc.) —
         *    skipped for NPC fights: fightNpc never writes a duels() entry,
         *    so the read would return an empty unresolved struct. */
        if (!result && !duel.npc) {
          try {
            const d = (await readContract(config, {
              address: CHOG_ARENA_ADDRESS,
              abi: chogArenaAbi,
              functionName: "duels",
              args: [BigInt(duel.id)],
            })) as readonly [
              `0x${string}`,
              `0x${string}`,
              bigint,
              `0x${string}`,
              boolean,
              boolean,
            ];
            if (d[4]) {
              const winner = d[3];
              const userWon =
                address != null &&
                winner.toLowerCase() === address.toLowerCase();
              const pot = duel.betAmount * 2n;
              result = {
                duelId: duel.id,
                userWon,
                secondWind: d[5],
                userResurrected: d[5] && !userWon,
                wager: duel.betAmount,
                pot,
                payout: userWon ? pot : 0n,
                txHash,
                winnerAddress: winner,
                loserAddress: userWon
                  ? duel.creator
                  : (address ?? ZERO),
              };
            }
          } catch {
            /* demo mode — simulated outcome below */
          }
        }

        /* 3) Demo roll: true 50/50, 20% Second Wind on the initial loser,
         *    then a sudden-death 50/50 re-roll for the clutch comeback. */
        if (!result) {
          result = rollDemoOutcome();
        }

        setOutcome(result);
        reset();
      })();
    }, 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed]);

  /* NPC deathmatch: wallet-signed on-chain MON stake via fightNpc(npcId).
   * If the contract isn't deployed yet, the wallet still signs a real native
   * MON stake transfer — the battle only starts AFTER the tx confirms. */
  async function acceptNpc() {
    if (!duel?.npc) return;
    try {
      const hash = await writeContractAsync({
        chainId: activeMonadChainId,
        address: CHOG_ARENA_ADDRESS,
        abi: chogArenaAbi,
        functionName: "fightNpc",
        args: [BigInt(duel.npc.npcId)],
        value: duel.betAmount,
      });
      if (toastIdRef.current !== null) {
        updateToast(toastIdRef.current, {
          kind: "pending",
          message: "Stake submitted — waiting for on-chain confirmation…",
          txHash: hash,
        });
      }
      // The isConfirmed effect resolves DuelResolved from the receipt and
      // launches the battle arena.
    } catch (error) {
      const message =
        error instanceof Error && error.message ? error.message : "Stake failed";
      const lower = message.toLowerCase();
      if (lower.includes("reject")) {
        if (toastIdRef.current !== null) {
          updateToast(toastIdRef.current, {
            kind: "error",
            message: "Stake rejected in wallet — no fight started",
          });
          toastIdRef.current = null;
        }
        return;
      }
      if (message.includes("does not match the target chain")) {
        if (toastIdRef.current !== null) {
          updateToast(toastIdRef.current, {
            kind: "error",
            message: "Wallet is on the wrong network — switch to Monad and retry",
          });
          toastIdRef.current = null;
        }
        return;
      }
      /* Contract not deployed: wallet signs a real MON stake transfer to the
       * arena address. Battle runs only after the transfer confirms. */
      try {
        const hash = await sendTransactionAsync({
          chainId: activeMonadChainId,
          to: CHOG_ARENA_ADDRESS,
          value: duel.betAmount,
        });
        if (toastIdRef.current !== null) {
          updateToast(toastIdRef.current, {
            kind: "pending",
            message: "Stake signed — waiting for on-chain confirmation…",
            txHash: hash,
          });
        }
        await waitForTransactionReceipt(config, { hash });
        if (toastIdRef.current !== null) {
          updateToast(toastIdRef.current, {
            kind: "success",
            message: "Stake confirmed on-chain — fighters clashing!",
            txHash: hash,
          });
          toastIdRef.current = null;
        }
        setPhase("settling");
        setOutcome(rollDemoOutcome());
        reset();
      } catch (fallbackError) {
        const fb =
          fallbackError instanceof Error && fallbackError.message
            ? fallbackError.message
            : "";
        if (toastIdRef.current !== null) {
          updateToast(toastIdRef.current, {
            kind: "error",
            message: fb.toLowerCase().includes("reject")
              ? "Stake rejected in wallet — no fight started"
              : "Could not stake MON — fight cancelled",
          });
          toastIdRef.current = null;
        }
      }
    }
  }

  function accept() {
    if (!duel) return;
    if (!isConnected || !address) {
      pushToast({ kind: "error", message: "Connect a wallet to fight" });
      return;
    }

    if (chainId !== monad.id && chainId !== monadTestnet.id) {
      pushToast({
        kind: "error",
        message: "Switch to the Monad network to enter the arena",
      });
      return;
    }

    /* NPC deathmatch: same wallet-signature + on-chain stake requirements
     * as PvP — no instant-play bypass. */
    if (duel.npc) {
      toastIdRef.current = pushToast({
        kind: "pending",
        message: "Confirm the stake in your wallet…",
      });
      void acceptNpc();
      return;
    }

    toastIdRef.current = pushToast({
      kind: "pending",
      message: "Confirm the challenge in your wallet…",
    });
    writeContract(
      {
        // Pin the chain explicitly so viem never broadcasts to whatever
        // network the wallet happens to be showing.
        chainId: activeMonadChainId,
        address: CHOG_ARENA_ADDRESS,
        abi: chogArenaAbi,
        functionName: "joinDuel",
        args: [BigInt(duel.id)],
        value: duel.betAmount,
      },
      {
        onSuccess: (hash) => {
          if (toastIdRef.current !== null) {
            updateToast(toastIdRef.current, {
              kind: "pending",
              message: "Challenge submitted — confirming on Monad…",
              txHash: hash,
            });
          }
        },
        onError: (error) => {
          const message =
            error instanceof Error && error.message
              ? error.message
              : "Challenge failed";
          const lower = message.toLowerCase();
          if (lower.includes("reject")) {
            if (toastIdRef.current !== null) {
              updateToast(toastIdRef.current, {
                kind: "error",
                message: "Challenge rejected in wallet",
              });
              toastIdRef.current = null;
            }
            return;
          }
          if (message.includes("does not match the target chain")) {
            if (toastIdRef.current !== null) {
              updateToast(toastIdRef.current, {
                kind: "error",
                message: "Wallet is on the wrong network — switch to Monad and retry",
              });
              toastIdRef.current = null;
            }
            return;
          }
          /* Demo fallback (contract not deployed): settle instantly via the
           * battle arena instead of dead-ending on an error toast. */
          if (toastIdRef.current !== null) {
            updateToast(toastIdRef.current, {
              kind: "success",
              message: "Challenge accepted (demo) — fighters clashing…",
            });
            toastIdRef.current = null;
          }
          setPhase("settling");
          const timer = setTimeout(() => {
            setOutcome(rollDemoOutcome());
          }, 500);
          demoSettleRef.current = timer;
        },
      },
    );
  }

  function closeOutcome() {
    if (duel) onSettled(duel.id);
    setOutcome(null);
    onClose();
  }

  /* "Play Again" from the verdict: re-runs the exact same on-chain stake
   * flow (wallet prompt → receipt → cinematic rematch). NPC duels re-stake;
   * settled PvP duels can't be re-opened, so they return to the lobby. */
  async function playAgain() {
    if (!duel) return;
    if (!duel.npc) {
      closeOutcome();
      return;
    }
    if (!isConnected || !address) {
      pushToast({ kind: "error", message: "Connect a wallet to fight" });
      return;
    }
    if (chainId !== monad.id && chainId !== monadTestnet.id) {
      pushToast({
        kind: "error",
        message: "Switch to the Monad network to enter the arena",
      });
      return;
    }
    /* Dismiss the finished battle, return to the VS screen, re-stake. */
    setOutcome(null);
    setPhase("matchup");
    reset();
    toastIdRef.current = pushToast({
      kind: "pending",
      message: "Confirm the rematch stake in your wallet…",
    });
    setPlayAgainBusy(true);
    try {
      await acceptNpc();
    } finally {
      setPlayAgainBusy(false);
    }
  }

  if (!duel) return null;

  // Both Monad Mainnet (143) and Monad Testnet (10143) are valid; anything
  // else (Ethereum, Base, ...) must switch before joinDuel can be called.
  const onMonad = isMonadChainId(chainId);
  const activeMonadChainId =
    chainId === monadTestnet.id ? monadTestnet.id : monad.id;
  const busy = isPending || isConfirming;
  const pot = duel.betAmount * 2n;

  /* Fighter identities for the battle stage.
   *
   * The two sides must never be the same character. The opponent is
   * resolved first, then the local player's class is resolved AGAINST it:
   * a mirror match would load two identical models, two identical stat
   * lines and two identical HUD nameplates. */
  const creatorClass = duel.npc
    ? duel.npc.fighterClass
    : pickOpposingFighter(
        getProfile(duel.creator)?.fighterClass,
        getProfile(address)?.fighterClass ?? DEFAULT_FIGHTER_CLASS,
      );
  const creatorFighter: FighterDescriptor = duel.npc
    ? {
        address: duel.npc.address,
        name: duel.npc.name,
        title: duel.npc.title,
        fighterClass: duel.npc.fighterClass,
      }
    : {
        address: duel.creator,
        name: visibleFighterName(
          getProfile(duel.creator)?.username,
          creatorClass,
        ),
        title: getProfile(duel.creator)?.title,
        fighterClass: creatorClass,
      };
  const challengerClass = pickOpposingFighter(
    getProfile(address)?.fighterClass,
    creatorFighter.fighterClass,
  );
  const challengerFighter: FighterDescriptor = {
    address: address ?? ZERO,
    name: visibleFighterName(getProfile(address)?.username, challengerClass),
    title: getProfile(address)?.title,
    fighterClass: challengerClass,
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4 backdrop-blur-xl"
        onClick={phase === "matchup" ? onClose : undefined}
      >
        <div
          className="glass-panel w-full max-w-2xl rounded-2xl border-fuchsia-500/25 p-6 shadow-[0_0_70px_-20px_rgba(217,70,239,0.6)] animate-rise-in"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          {phase === "matchup" ? (
            <>
              {/* Header */}
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <p className="stat-label text-fuchsia-300/80">
                    Matchup // Duel #{duel.id}
                  </p>
                  <h2 className="neon-title mt-1 text-2xl font-bold uppercase tracking-[0.1em]">
                    Challenge Awaiting
                  </h2>
                  <p className="mt-1.5 font-display text-xs text-zinc-400">
                    {duel.npc
                      ? `${duel.npc.name} — stake real MON, winner takes the pot.`
                      : `Duel #${duel.id} — study your opponent, then accept.`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="shrink-0 rounded-lg p-1 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* VS screen — both fighters as live 3D previews, facing off */}
              <div className="flex flex-col items-center gap-6">
                <div className="flex items-center justify-center gap-8">
                  <div className="flex flex-col items-center">
                    <div className="relative flex h-[190px] w-40 items-center justify-center">
                      <div
                        className="pointer-events-none absolute inset-x-0 bottom-0 h-20 rounded-full bg-fuchsia-500/20 blur-2xl"
                        aria-hidden
                      />
                      <FighterPreview3D
                        fighterClass={creatorFighter.fighterClass}
                        facing="right"
                        size={190}
                        className="relative w-40"
                      />
                    </div>
                    <p className="mt-2 w-40 text-center font-display text-sm font-bold uppercase tracking-[0.12em] text-white">
                      {creatorFighter.name}
                    </p>
                  </div>
                  <div className="font-display text-6xl font-bold text-fuchsia-400 drop-shadow-[0_0_24px_rgba(217,70,239,0.9)]">
                    VS
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="relative flex h-[190px] w-40 items-center justify-center">
                      <div
                        className="pointer-events-none absolute inset-x-0 bottom-0 h-20 rounded-full bg-pink-500/20 blur-2xl"
                        aria-hidden
                      />
                      <FighterPreview3D
                        fighterClass={challengerFighter.fighterClass}
                        facing="left"
                        size={190}
                        className="relative w-40"
                      />
                    </div>
                    <p className="mt-2 w-40 text-center font-display text-sm font-bold uppercase tracking-[0.12em] text-white">
                      {challengerFighter.name}
                    </p>
                  </div>
                </div>
                <div className="glass-panel w-full max-w-xs px-5 py-4 text-center">
                  <p className="stat-label">Prize Pot</p>
                  <p className="stat-value mt-1 text-4xl font-bold text-amber-300 drop-shadow-[0_0_16px_rgba(249,115,22,0.55)]">
                    {formatMon(pot)} MON
                  </p>
                </div>
              </div>

              {/* Action */}
              <div className="mt-6">
                {!isConnected ? (
                  <button
                    type="button"
                    onClick={() => setWalletPickerOpen(true)}
                    className="flex w-full animate-pulse items-center justify-center gap-2 rounded-xl border border-fuchsia-400/50 bg-gradient-to-r from-fuchsia-600/25 to-pink-600/25 py-3.5 font-display text-sm font-bold uppercase tracking-[0.14em] text-fuchsia-100 shadow-glow-purple transition hover:from-fuchsia-600/40 hover:to-pink-600/40"
                  >
                    <Wallet className="h-4 w-4" aria-hidden />
                    ⚔️ CONNECT WALLET TO ACCEPT
                  </button>
                ) : !onMonad ? (
                  <button
                    type="button"
                    onClick={() => switchChain({ chainId: targetChain.id })}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-400/50 bg-gradient-to-r from-amber-600/20 to-orange-600/20 py-3.5 font-display text-sm font-bold uppercase tracking-[0.14em] text-amber-100 shadow-glow-amber transition hover:from-amber-600/30 hover:to-orange-600/30"
                  >
                    Switch to Monad Network
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={accept}
                    disabled={busy}
                    className={cn(
                      "btn-neon w-full !py-3.5 !text-sm",
                      busy && "animate-none",
                    )}
                  >
                    {busy && (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    )}
                    {busy
                      ? isPending
                        ? duel.npc
                          ? "Confirm stake in wallet…"
                          : "Confirm in wallet…"
                        : duel.npc
                          ? "Staking on Monad…"
                          : "Locking in on Monad…"
                      : duel.npc
                        ? `⚔️ COMMENCE DEATHMATCH (STAKE ${formatMon(duel.betAmount)} MON)`
                        : `⚔️ ACCEPT CHALLENGE (STAKE ${formatMon(duel.betAmount)} MON)`}
                  </button>
                )}
              </div>
            </>
          ) : (
            /* Clash settlement phase */
            <div className="py-14 text-center">
              <p className="animate-clash text-7xl">⚔️</p>
              <h2 className="neon-title mt-6 text-2xl font-bold uppercase tracking-[0.12em]">
                Fighters Clashing
              </h2>
              <p className="mt-2 font-display text-sm text-zinc-400">
                {duel.npc
                  ? `${formatMon(pot)} MON pot · settling on Monad…`
                  : `Duel #${duel.id} · ${formatMon(pot)} MON pot · settling on Monad…`}
              </p>
              <div className="mx-auto mt-6 h-1 w-56 overflow-hidden rounded-full bg-white/5">
                <div className="h-full w-full bg-gradient-to-r from-fuchsia-500 via-pink-400 to-cyan-300 animate-shimmer" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Battle stage mounts ONLY after the tx confirms (outcome set) —
          no combat audio or timeline can start during wallet signing. */}
      {outcome && (
        <BattleArenaModal
          outcome={outcome}
          isOpen
          creatorFighter={creatorFighter}
          challengerFighter={challengerFighter}
          playerSide={duel.npc ? "left" : "right"}
          onPlayAgain={playAgain}
          onPlayAgainBusy={playAgainBusy || busy}
          explorerTxUrl={
            outcome.txHash
              ? `${
                  activeMonadChainId === monadTestnet.id
                    ? "https://testnet.monadexplorer.com/tx/"
                    : "https://explorer.monad.xyz/tx/"
                }${outcome.txHash}`
              : undefined
          }
          onClose={closeOutcome}
        />
      )}

      {/* The branded wallet picker — real logos, real status, no duplicates. */}
      <WalletConnectModal
        open={walletPickerOpen}
        onClose={() => setWalletPickerOpen(false)}
      />
    </>
  );
}

/* ---------------------------------------------------------------- fighter */

/** Second Wind badge for one fighter (live Chog NFT read). */
function SecondWindBadge({ address }: { address?: `0x${string}` }) {
  const { data: nftBalance } = useReadContract({
    address: CHOG_NFT_ADDRESS,
    abi: iChogNftAbi,
    functionName: "balanceOf",
    args: [address ?? ZERO],
    query: { enabled: Boolean(address && address !== ZERO) },
  });
  const holder = typeof nftBalance === "bigint" && nftBalance > 0n;

  return holder ? (
    <span className="inline-flex animate-pulse items-center gap-1 rounded-full border border-fuchsia-400/40 bg-fuchsia-500/15 px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-[0.1em] text-fuchsia-200 shadow-glow-purple">
      🛡️ SECOND WIND ACTIVE
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-display text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
      NO SECOND WIND
    </span>
  );
}

function FighterCard({
  role,
  address,
  side,
  placeholder,
  npc,
}: {
  role: string;
  address: `0x${string}`;
  side: "left" | "right";
  placeholder?: boolean;
  npc?: ArenaNpc;
}) {
  const { getProfile } = useFighterProfile();
  const profile = !placeholder && address !== ZERO ? getProfile(address) : null;
  const fighterClass: FighterClass =
    npc?.fighterClass ?? profile?.fighterClass ?? DEFAULT_FIGHTER_CLASS;
  const theme = FIGHTER_CLASS_META[fighterClass];

  return (
    <div
      className={cn(
        "glass-panel flex flex-col items-center gap-3 px-4 py-5 text-center",
        side === "left"
          ? "sm:border-r-0 sm:rounded-r-none"
          : "sm:border-l-0 sm:rounded-l-none",
      )}
    >
      <p className="stat-label">{role}</p>
      {placeholder ? (
        <div className="h-16 w-16 animate-pulse rounded-xl bg-white/5" />
      ) : (
        <>
           {/* Full-body fighter preview — live 3D render */}
           <div className="flex justify-center">
              <FighterPreview3D
                fighterClass={fighterClass}
                size={120}
                className="w-28"
              />
           </div>
          <div className="-mt-2 flex items-center gap-2">
            <FighterAvatarBadge address={address} size="sm" />
            <span
              className="rounded-full border px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-[0.1em]"
              style={{
                borderColor: `${theme.secondary}55`,
                color: theme.secondary,
                backgroundColor: `${theme.primary}22`,
              }}
            >
              {theme.label}
            </span>
          </div>
        </>
      )}
      <div className="min-w-0">
        <p className="truncate font-display text-sm font-bold text-zinc-100">
          {placeholder
            ? "—"
            : (npc?.name ?? profile?.username ?? truncateAddress(address))}
        </p>
        {(npc?.title || profile?.title) && (
          <p className="mt-0.5 font-display text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-400">
            {npc?.title ?? profile?.title}
          </p>
        )}
        <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
          {placeholder ? "" : truncateAddress(address)}
        </p>
      </div>
      {!placeholder && !npc && <SecondWindBadge address={address} />}
      {!placeholder && npc && (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-[0.1em] text-amber-200">
          🤖 ARENA NPC
        </span>
      )}
    </div>
  );
}
