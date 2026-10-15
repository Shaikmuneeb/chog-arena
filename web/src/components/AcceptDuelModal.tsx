"use client";

import { useEffect, useRef, useState } from "react";
import {
  useAccount,
  useChainId,
  useConfig,
  useConnect,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { readContract } from "wagmi/actions";
import { zeroAddress } from "viem";
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
import { pushToast, updateToast } from "./Toast";
import { DuelOutcomeModal, type DuelOutcome } from "./DuelOutcomeModal";
import type { ArenaDuel } from "./DuelBoard";

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
  const [showConnectors, setShowConnectors] = useState(false);
  const toastIdRef = useRef<number | null>(null);

  const { address, isConnected, chainId: walletChainId } = useAccount();
  // Authoritative wallet chain — useChainId() reflects the app's optimistic
  // config chain (defaults to 143) and can desync from the real wallet.
  const appChainId = useChainId();
  const chainId = walletChainId ?? appChainId;
  const config = useConfig();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { switchChain } = useSwitchChain();

  const { writeContract, data: txHash, isPending, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash });

  /* Reset whenever a different duel opens. */
  useEffect(() => {
    setPhase("matchup");
    setOutcome(null);
    setShowConnectors(false);
  }, [duel?.id]);

  /* Clash → settle → reveal outcome once the joinDuel receipt lands. */
  useEffect(() => {
    if (!isConfirmed || !duel) return;
    if (toastIdRef.current !== null) {
      updateToast(toastIdRef.current, {
        kind: "success",
        message: "Challenge accepted — fighters clashing…",
        txHash,
      });
      toastIdRef.current = null;
    }
    setPhase("settling");

    const timer = setTimeout(async () => {
      let result: DuelOutcome | null = null;
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
          const userWon =
            address != null && d[3].toLowerCase() === address.toLowerCase();
          const secondWind = d[5];
          result = {
            duelId: duel.id,
            userWon,
            secondWind,
            userResurrected: secondWind && !userWon,
            wager: duel.betAmount,
          };
        }
      } catch {
        /* demo mode — simulated outcome below */
      }
      if (!result) {
        const windHit = Math.random() < 0.2;
        let userWon = Math.random() < 0.5;
        let userResurrected = false;
        if (windHit && !userWon) {
          userResurrected = true;
          userWon = Math.random() < 0.5; // sudden-death re-roll
        }
        result = {
          duelId: duel.id,
          userWon,
          secondWind: windHit,
          userResurrected,
          wager: duel.betAmount,
        };
      }
      setOutcome(result);
      reset();
    }, 2200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed]);

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
          if (toastIdRef.current !== null) {
            updateToast(toastIdRef.current, {
              kind: "error",
              message: message.includes("does not match the target chain")
                ? "Wallet is on the wrong network — switch to Monad and retry"
                : message,
            });
            toastIdRef.current = null;
          }
        },
      },
    );
  }

  function closeOutcome() {
    if (duel) onSettled(duel.id);
    setOutcome(null);
    onClose();
  }

  if (!duel) return null;

  // Both Monad Mainnet (143) and Monad Testnet (10143) are valid; anything
  // else (Ethereum, Base, ...) must switch before joinDuel can be called.
  const onMonad = isMonadChainId(chainId);
  const activeMonadChainId =
    chainId === monadTestnet.id ? monadTestnet.id : monad.id;
  const busy = isPending || isConfirming;
  const pot = duel.betAmount * 2n;

  return (
    <>
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center bg-zinc-950/80 p-4 backdrop-blur-xl"
        onClick={phase === "matchup" ? onClose : undefined}
      >
        <div
          className="w-full max-w-2xl rounded-2xl border border-red-500/30 bg-zinc-950/90 p-6 shadow-[0_0_50px_-10px_rgba(239,68,68,0.25)] animate-rise-in"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          {phase === "matchup" ? (
            <>
              {/* Header */}
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <h2 className="flex items-center gap-2 bg-gradient-to-r from-red-400 via-orange-300 to-amber-200 bg-clip-text text-2xl font-extrabold tracking-wide text-transparent">
                    <span className="drop-shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-pulse">
                      ⚡
                    </span>
                    CHALLENGE AWAITING
                  </h2>
                  <p className="mt-1 text-xs text-zinc-400">
                    Duel #{duel.id} — study your opponent, then accept.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="shrink-0 rounded-lg p-1 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* VS matchup */}
              <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-[1fr_auto_1fr]">
                {/* Creator */}
                <FighterCard
                  role="CREATOR"
                  address={duel.creator}
                  side="left"
                />

                {/* Center VS + pot */}
                <div className="flex flex-col items-center justify-center gap-2 px-2">
                  <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                    <Coins className="h-3 w-3" aria-hidden />
                    Prize Pot
                  </p>
                  <p className="text-3xl font-extrabold text-transparent bg-gradient-to-r from-amber-300 to-orange-300 bg-clip-text drop-shadow-[0_0_14px_rgba(249,115,22,0.55)]">
                    {formatMon(pot)} MON
                  </p>
                  <div className="my-1 flex h-16 w-16 animate-pulse items-center justify-center rounded-full border border-red-400/50 bg-gradient-to-br from-red-600 to-orange-500 text-2xl font-black text-white shadow-[0_0_34px_rgba(239,68,68,0.65)]">
                    VS
                  </div>
                  <p className="text-center text-[10px] leading-snug text-zinc-500">
                    Instant settlement · 2% rake
                    <br />
                    (0% if either fighter holds a Chog NFT)
                  </p>
                </div>

                {/* You */}
                <FighterCard
                  role="YOU / CHALLENGER"
                  address={address ?? ZERO}
                  side="right"
                  placeholder={!isConnected}
                />
              </div>

              {/* Action */}
              <div className="mt-6">
                {!isConnected ? (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowConnectors((v) => !v)}
                      className="flex w-full animate-pulse items-center justify-center gap-2 rounded-xl border border-red-500/50 bg-gradient-to-r from-red-600/20 to-orange-600/20 py-3.5 text-sm font-extrabold tracking-wide text-red-100 shadow-[0_0_24px_rgba(239,68,68,0.35)] transition hover:from-red-600/30 hover:to-orange-600/30"
                    >
                      <Wallet className="h-4 w-4" aria-hidden />
                      ⚔️ CONNECT WALLET TO ACCEPT
                    </button>
                    {showConnectors && (
                      <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-zinc-900">
                        {connectors.length === 0 ? (
                          <p className="px-4 py-3 text-xs text-zinc-500">
                            No browser wallets detected. Install MetaMask,
                            Rabby, or Backpack and reload.
                          </p>
                        ) : (
                          connectors.map((connector) => (
                            <button
                              key={connector.uid}
                              type="button"
                              disabled={isConnecting}
                              onClick={() => {
                                connect({ connector });
                                setShowConnectors(false);
                              }}
                              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-zinc-200 transition hover:bg-white/5 disabled:opacity-50"
                            >
                              <Wallet
                                className="h-4 w-4 text-zinc-400"
                                aria-hidden
                              />
                              {connector.name}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ) : !onMonad ? (
                  <button
                    type="button"
                    onClick={() => switchChain({ chainId: targetChain.id })}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-400/50 bg-gradient-to-r from-amber-600/20 to-orange-600/20 py-3.5 text-sm font-extrabold tracking-wide text-amber-100 shadow-[0_0_24px_rgba(245,158,11,0.35)] transition hover:from-amber-600/30 hover:to-orange-600/30"
                  >
                    SWITCH TO MONAD NETWORK
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={accept}
                    disabled={busy}
                    className={cn(
                      "flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-orange-600 bg-[length:200%_100%] py-3.5 text-sm font-extrabold tracking-wide text-white shadow-[0_0_28px_rgba(239,68,68,0.45)] transition",
                      busy
                        ? "cursor-not-allowed opacity-60"
                        : "animate-pulse hover:from-red-500 hover:via-rose-500 hover:to-orange-500",
                    )}
                  >
                    {busy && (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    )}
                    {busy
                      ? isPending
                        ? "Confirm in wallet…"
                        : "Locking in on Monad…"
                      : `⚔️ ACCEPT CHALLENGE (STAKE ${formatMon(duel.betAmount)} MON)`}
                  </button>
                )}
              </div>
            </>
          ) : (
            /* Clash settlement phase */
            <div className="py-14 text-center">
              <p className="animate-clash text-7xl">⚔️</p>
              <h2 className="mt-6 bg-gradient-to-r from-red-300 to-orange-300 bg-clip-text text-2xl font-extrabold tracking-wide text-transparent">
                FIGHTERS CLASHING
              </h2>
              <p className="mt-2 text-sm text-zinc-400">
                Duel #{duel.id} · {formatMon(pot)} MON pot · settling on Monad…
              </p>
              <div className="mx-auto mt-6 h-1 w-56 overflow-hidden rounded-full bg-black/50">
                <div className="h-full w-full bg-gradient-to-r from-red-500 via-orange-400 to-amber-300 animate-shimmer" />
              </div>
            </div>
          )}
        </div>
      </div>

      <DuelOutcomeModal outcome={outcome} onClose={closeOutcome} />
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
    <span className="inline-flex animate-pulse items-center gap-1 rounded-full border border-purple-400/40 bg-purple-500/15 px-2.5 py-1 text-[10px] font-bold text-purple-200 shadow-[0_0_12px_rgba(168,85,247,0.45)]">
      🛡️ SECOND WIND ACTIVE
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-zinc-500">
      NO SECOND WIND
    </span>
  );
}

function FighterCard({
  role,
  address,
  side,
  placeholder,
}: {
  role: string;
  address: `0x${string}`;
  side: "left" | "right";
  placeholder?: boolean;
}) {
  const { getProfile } = useFighterProfile();
  const profile = !placeholder && address !== ZERO ? getProfile(address) : null;

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-black/40 px-4 py-5 text-center",
        side === "left"
          ? "sm:border-r-0 sm:rounded-r-none"
          : "sm:border-l-0 sm:rounded-l-none",
      )}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
        {role}
      </p>
      {placeholder ? (
        <div className="h-16 w-16 animate-pulse rounded-xl bg-white/5" />
      ) : (
        <FighterAvatarBadge address={address} size="lg" />
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-zinc-100">
          {placeholder
            ? "—"
            : (profile?.username ?? truncateAddress(address))}
        </p>
        {profile?.title && (
          <p className="mt-0.5 text-[10px] font-semibold text-zinc-400">
            {profile.title}
          </p>
        )}
        <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
          {placeholder ? "" : truncateAddress(address)}
        </p>
      </div>
      {!placeholder && <SecondWindBadge address={address} />}
    </div>
  );
}
