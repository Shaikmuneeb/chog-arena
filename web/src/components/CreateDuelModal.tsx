"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  useAccount,
  useBalance,
  useChainId,
  useConnect,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { formatEther, parseEther } from "viem";
import { Coins, Loader2, Swords, Wallet, X, Zap } from "lucide-react";
import {
  CHOG_ARENA_ADDRESS,
  CHOG_NFT_ADDRESS,
  chogArenaAbi,
  iChogNftAbi,
} from "@/contracts";
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

const ZERO = "0x0000000000000000000000000000000000000000";
const BPS = 10000n;
const RAKE_BPS = 200n; // 2% arena rake
const GAS_BUFFER = 10_000_000_000_000_000n; // 0.01 MON reserved for gas on MAX

const QUICK_AMOUNTS = ["0.1", "0.5", "1", "5", "10"] as const;

type CreateDuelModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (betAmount: bigint) => void;
};

/**
 * Cyberpunk-styled duel forge: stake MON, live battle math (pot, rake,
 * Second Wind defense), and ChogArena.createDuel{value} submission.
 */
export function CreateDuelModal({ open, onClose, onCreated }: CreateDuelModalProps) {
  const [amount, setAmount] = useState("");
  const [activeChip, setActiveChip] = useState<string | null>(null);
  const [showConnectors, setShowConnectors] = useState(false);
  const toastIdRef = useRef<number | null>(null);
  const { getProfile } = useFighterProfile();

  const { address, isConnected, chainId: walletChainId } = useAccount();
  // useChainId() is the APP's chain (config default 143, optimistic after
  // switchChain) and can desync from the real wallet. The connector-reported
  // account chain is authoritative for gating writes.
  const appChainId = useChainId();
  const chainId = walletChainId ?? appChainId;
  const { switchChain } = useSwitchChain();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { data: balance } = useBalance({
    address,
    chainId,
    query: { enabled: Boolean(address) },
  });

  const { data: nftBalance } = useReadContract({
    address: CHOG_NFT_ADDRESS,
    abi: iChogNftAbi,
    functionName: "balanceOf",
    args: [address ?? ZERO],
    query: { enabled: Boolean(address), refetchInterval: 15_000 },
  });
  const isChogHolder = typeof nftBalance === "bigint" && nftBalance > 0n;

  const { writeContract, data: txHash, isPending, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash });

  const wagerWei = useMemo(() => {
    if (!amount) return 0n;
    try {
      const parsed = parseEther(amount);
      return parsed > 0n ? parsed : 0n;
    } catch {
      return 0n;
    }
  }, [amount]);

  /* Live battle math — contract rakes 2% of the whole pot (2× wager). */
  const pot = wagerWei * 2n;
  const fee = isChogHolder ? 0n : (pot * RAKE_BPS) / BPS;
  const takehome = pot - fee;

  useEffect(() => {
    if (open) {
      setAmount("");
      setActiveChip(null);
      setShowConnectors(false);
    }
  }, [open]);

  useEffect(() => {
    if (!isConfirmed) return;
    if (toastIdRef.current !== null) {
      updateToast(toastIdRef.current, {
        kind: "success",
        message: "Duel forged — waiting for a challenger",
        txHash,
      });
      toastIdRef.current = null;
    }
    onCreated(wagerWei);
    reset();
    onClose();
  }, [isConfirmed, txHash, reset, onClose, onCreated, wagerWei]);

  const amountInvalid = amount !== "" && wagerWei <= 0n;
  // Both Monad Mainnet (143) and Monad Testnet (10143) are valid; anything
  // else (Ethereum, Base, ...) must switch before createDuel can be called.
  const onMonad = isMonadChainId(chainId);
  const activeMonadChainId =
    chainId === monadTestnet.id ? monadTestnet.id : monad.id;
  const busy = isPending || isConfirming;
  const canSubmit = isConnected && onMonad && wagerWei > 0n && !busy;

  function pickChip(value: string) {
    setAmount(value);
    setActiveChip(value);
  }

  function pickMax() {
    if (!balance || balance.value <= 0n) return;
    const max =
      balance.value > GAS_BUFFER ? balance.value - GAS_BUFFER : balance.value;
    setAmount(formatEther(max));
    setActiveChip("MAX");
  }

  function submit() {
    if (!canSubmit) return;
    toastIdRef.current = pushToast({
      kind: "pending",
      message: "Confirm forging the duel in your wallet…",
    });
    writeContract(
      {
        // Pin the chain explicitly so viem never broadcasts to whatever
        // network the wallet happens to be showing.
        chainId: activeMonadChainId,
        address: CHOG_ARENA_ADDRESS,
        abi: chogArenaAbi,
        functionName: "createDuel",
        value: wagerWei,
      },
      {
        onSuccess: (hash) => {
          if (toastIdRef.current !== null) {
            updateToast(toastIdRef.current, {
              kind: "pending",
              message: "Duel tx submitted — confirming on Monad…",
              txHash: hash,
            });
          }
        },
        onError: (error) => {
          const message =
            error instanceof Error && error.message
              ? error.message
              : "Failed to forge duel";
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-zinc-950/80 p-4 backdrop-blur-xl"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-red-500/30 bg-zinc-950/90 p-6 shadow-[0_0_50px_-10px_rgba(239,68,68,0.25)] animate-rise-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="flex items-center gap-2 bg-gradient-to-r from-red-400 via-orange-300 to-amber-200 bg-clip-text text-2xl font-extrabold tracking-wide text-transparent">
              <span className="drop-shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-pulse">
                ⚔️
              </span>
              FORGE A DUEL
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              Stake native MON. Instant on-chain resolution. Winner claims the
              pot.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isConnected && address && (
              <span
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-2.5"
                title="Your fighter"
              >
                <FighterAvatarBadge address={address} size="sm" />
                <span className="max-w-24 truncate text-[11px] font-bold text-zinc-200">
                  {getProfile(address)?.username ?? truncateAddress(address)}
                </span>
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-1 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Wager input */}
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Wager
          </label>
          <span className="text-[11px] text-zinc-500">
            Wallet Balance:{" "}
            <span className="font-semibold text-amber-200">
              {balance
                ? `${Number(balance.formatted).toLocaleString("en-US", { maximumFractionDigits: 3 })} MON`
                : isConnected
                  ? "0 MON"
                  : "—"}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/50 px-3 py-3 transition focus-within:border-red-500/70 focus-within:shadow-[0_0_18px_rgba(239,68,68,0.35)]">
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={(e) => {
              const next = e.target.value;
              if (/^\d*\.?\d*$/.test(next)) {
                setAmount(next);
                setActiveChip(null);
              }
            }}
            className="w-full bg-transparent text-xl font-bold text-zinc-100 outline-none placeholder:text-zinc-700"
          />
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs font-bold text-zinc-300">
            MON
          </span>
        </div>
        {amountInvalid && (
          <p className="mt-1 text-xs text-red-400">Enter a valid MON amount</p>
        )}

        {/* Quick chips */}
        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_AMOUNTS.map((quick) => (
            <button
              key={quick}
              type="button"
              onClick={() => pickChip(quick)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                activeChip === quick
                  ? "border-red-500/60 bg-red-500/15 text-red-200 shadow-[0_0_14px_rgba(239,68,68,0.4)]"
                  : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10",
              )}
            >
              {quick} MON
            </button>
          ))}
          <button
            type="button"
            onClick={pickMax}
            disabled={!balance || balance.value === 0n}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40",
              activeChip === "MAX"
                ? "border-amber-400/60 bg-amber-500/15 text-amber-200 shadow-[0_0_14px_rgba(245,158,11,0.4)]"
                : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10",
            )}
          >
            MAX
          </button>
        </div>

        {/* Battle calculations */}
        <div className="mt-5 divide-y divide-white/5 rounded-xl border border-white/5 bg-black/40">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
              <Coins className="h-3.5 w-3.5" aria-hidden />
              Total Arena Pot
            </span>
            <span className="text-2xl font-extrabold text-transparent bg-gradient-to-r from-amber-300 to-orange-300 bg-clip-text drop-shadow-[0_0_12px_rgba(249,115,22,0.5)]">
              {formatMon(pot)} MON
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-xs font-medium text-zinc-400">
              Potential Takehome
            </span>
            <div className="text-right">
              <span className="block text-sm font-bold text-emerald-300">
                {formatMon(takehome)} MON
              </span>
              {isChogHolder ? (
                <span className="mt-0.5 inline-block rounded-full border border-purple-400/40 bg-purple-500/15 px-2 py-0.5 text-[10px] font-semibold text-purple-200">
                  0% Protocol Rake (Chog NFT Holder)
                </span>
              ) : (
                <span className="mt-0.5 inline-block text-[10px] font-semibold text-amber-300/80">
                  2% Arena Rake
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-xs font-medium text-zinc-400">
              Second Wind Defense
            </span>
            {isChogHolder ? (
              <span className="inline-flex animate-pulse items-center gap-1 rounded-full border border-purple-400/40 bg-purple-500/15 px-2.5 py-1 text-[10px] font-bold text-purple-200 shadow-[0_0_14px_rgba(168,85,247,0.45)]">
                🛡️ Second Wind: 20% Instant Resurrect Active
              </span>
            ) : (
              <span className="text-right text-[10px] leading-snug text-zinc-500">
                ⚠️ Second Wind: Inactive (Hold a Chog NFT for a 20% Sudden
                Death re-roll)
              </span>
            )}
          </div>
        </div>

        {/* Action */}
        {!isConnected ? (
          <div className="mt-5">
            <button
              type="button"
              onClick={() => setShowConnectors((v) => !v)}
              className="flex w-full animate-pulse items-center justify-center gap-2 rounded-xl border border-red-500/50 bg-gradient-to-r from-red-600/20 to-orange-600/20 py-3.5 text-sm font-extrabold tracking-wide text-red-100 shadow-[0_0_24px_rgba(239,68,68,0.35)] transition hover:from-red-600/30 hover:to-orange-600/30"
            >
              <Swords className="h-4 w-4" aria-hidden />
              ⚔️ CONNECT WALLET TO ENTER ARENA
            </button>
            {showConnectors && (
              <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-zinc-900">
                {connectors.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-zinc-500">
                    No browser wallets detected. Install MetaMask, Rabby, or
                    Backpack and reload.
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
                      <Wallet className="h-4 w-4 text-zinc-400" aria-hidden />
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
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-amber-400/50 bg-gradient-to-r from-amber-600/20 to-orange-600/20 py-3.5 text-sm font-extrabold tracking-wide text-amber-100 shadow-[0_0_24px_rgba(245,158,11,0.35)] transition hover:from-amber-600/30 hover:to-orange-600/30"
          >
            SWITCH TO MONAD NETWORK
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className={cn(
              "mt-5 flex w-full animate-pulse items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-orange-600 bg-[length:200%_100%] py-3.5 text-sm font-extrabold tracking-wide text-white shadow-[0_0_28px_rgba(239,68,68,0.45)] transition",
              canSubmit
                ? "hover:from-red-500 hover:via-rose-500 hover:to-orange-500"
                : "cursor-not-allowed opacity-50 animate-none",
            )}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {busy
              ? isPending
                ? "Confirm in wallet…"
                : "Forging on Monad…"
              : `🔥 INITIATE DUEL (STAKE ${formatMon(wagerWei)} MON)`}
          </button>
        )}
      </div>
    </div>
  );
}
