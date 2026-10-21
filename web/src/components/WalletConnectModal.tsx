"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Loader2,
  LogOut,
  RefreshCw,
  Wallet,
  X,
} from "lucide-react";
import { useBalance } from "wagmi";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import { WalletIcon, type WalletBrand } from "@/components/WalletIcons";
import { monad, monadTestnet } from "@/config/monadChain";
import { cn, truncateAddress } from "@/lib/utils";

/**
 * The wallet picker.
 *
 * A dark glass panel over a blurred backdrop: the arena's own design
 * language (OLED black, hairline borders, neon pink) applied to the one
 * screen that has to feel instant and dependable.
 *
 * Every row carries its own status - idle, connecting, connected, failed -
 * so a click never leaves the visitor staring at a dead button, and a
 * failure always says what went wrong and offers a retry.
 */
export function WalletConnectModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    mounted,
    wallets,
    active,
    address,
    chainId,
    isConnected,
    isConnecting,
    auto,
    connectWallet,
    cancel,
    disconnectWallet,
  } = useWalletConnection();

  const { data: balance } = useBalance({
    address,
    chainId,
    query: { enabled: Boolean(address) },
  });

  /* ESC closes, the backdrop click closes */
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* a fresh open always starts from a clean slate */
  const openRef = useRef(open);
  useEffect(() => {
    if (open && !openRef.current) cancel();
    openRef.current = open;
  }, [open, cancel]);

  const monBalance = useMemo(() => {
    if (!balance) return "—";
    return `${Number(balance.formatted).toLocaleString("en-US", {
      maximumFractionDigits: 3,
    })} MON`;
  }, [balance]);

  const onWrongNetwork =
    isConnected && chainId !== monad.id && chainId !== monadTestnet.id;

  /* nothing in the list can actually be used */
  const nothingInstalled =
    wallets.length > 0 && wallets.every((wallet) => !wallet.installed);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Connect wallet"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-pink-500/30 bg-black/90 backdrop-blur-md shadow-[0_0_30px_rgba(236,72,153,0.15)] animate-rise-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ---- header ---- */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <p className="stat-label text-pink-300/80">Chog Arena // Wallet</p>
            <h2 className="mt-1 font-display text-xl font-bold uppercase tracking-[0.12em] text-white">
              {isConnected ? "Wallet Connected" : "Connect Wallet"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/5 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ---- body ---- */}
        <div className="max-h-[62vh] overflow-y-auto p-3">
          {!mounted ? (
            <div className="flex items-center justify-center gap-2 py-10 font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Scanning for wallets
            </div>
          ) : isConnected ? (
            <ConnectedPanel
              address={address}
              balance={monBalance}
              chainId={chainId}
              wrongNetwork={onWrongNetwork}
              onDisconnect={disconnectWallet}
            />
          ) : (
            <>
              {auto === "scanning" && (
                <p className="mb-2 flex items-center gap-2 px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  Reconnecting to an authorised wallet
                </p>
              )}

              {wallets.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-8 text-center">
                  <Wallet className="mx-auto h-8 w-8 text-zinc-600" aria-hidden />
                  <p className="mt-3 font-display text-sm font-bold uppercase tracking-[0.12em] text-zinc-300">
                    No wallet detected
                  </p>
                  <p className="mx-auto mt-2 max-w-xs font-display text-xs text-zinc-500">
                    Install MetaMask, Rabby, Backpack or Coinbase Wallet, then
                    reload this page.
                  </p>
                </div>
              ) : (
                <>
                  {nothingInstalled && (
                    <p className="mb-2 rounded-xl border border-amber-400/25 bg-amber-500/[0.07] px-3.5 py-2.5 font-display text-xs text-amber-200">
                      No wallet detected — install MetaMask, Rabby, Backpack or
                      Coinbase Wallet, then reload.
                    </p>
                  )}
                  <ul className="space-y-1.5">
                    {wallets.map((wallet) => (
                      <WalletRow
                        key={wallet.id}
                        wallet={wallet}
                        onConnect={() => void connectWallet(wallet.id)}
                      />
                    ))}
                  </ul>
                </>
              )}

              {isConnecting && (
                <button
                  type="button"
                  onClick={cancel}
                  className="mt-3 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 font-display text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400 transition hover:border-rose-400/40 hover:text-rose-200"
                >
                  Cancel
                </button>
              )}
            </>
          )}
        </div>

        {/* ---- footer ---- */}
        <div className="border-t border-white/10 px-5 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
            Non-custodial - you keep your keys
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- row */

function WalletRow({
  wallet,
  onConnect,
}: {
  wallet: {
    id: string;
    name: string;
    brand?: WalletBrand;
    monogram: string;
    status: string;
    message?: string;
    installed: boolean;
  };
  onConnect: () => void;
}) {
  const connecting = wallet.status === "connecting";
  const failed = wallet.status === "error";
  const missing = wallet.status === "missing";
  const connected = wallet.status === "connected";

  return (
    <li>
      <button
        type="button"
        onClick={onConnect}
        disabled={connecting || connected || missing}
        className={cn(
          "group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border px-3 py-3 text-left transition-all duration-200",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/60",
          connected
            ? "border-emerald-400/30 bg-emerald-500/[0.07]"
            : failed
              ? "border-rose-400/30 bg-rose-500/[0.06]"
              : missing
                ? "border-white/5 bg-white/[0.01] opacity-50"
                : "border-white/10 bg-white/[0.03] hover:border-pink-400/50 hover:bg-pink-500/[0.08] hover:shadow-[0_0_24px_-6px_rgba(236,72,153,0.55)] active:scale-[0.99]",
          connecting && "cursor-wait border-pink-400/40 bg-pink-500/[0.08]",
        )}
      >
        {/* the wallet tile - a glass plate holding the brand's own mark */}
        <span
          className={cn(
            "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05]",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-sm",
            connected && "border-emerald-400/40 bg-emerald-500/10",
            failed && "border-rose-400/40 bg-rose-500/10",
            connecting && "border-pink-400/40 bg-pink-500/10",
          )}
        >
          <span className="flex h-8 w-8 items-center justify-center">
            <WalletIcon brand={wallet.brand} monogram={wallet.monogram} />
          </span>
          {connected && (
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400 text-black ring-2 ring-black">
              <Check className="h-2.5 w-2.5" aria-hidden />
            </span>
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block font-display text-sm font-bold uppercase tracking-[0.1em] text-zinc-100">
            {wallet.name}
          </span>
          <span
            className={cn(
              "mt-0.5 block font-mono text-[10px] uppercase tracking-[0.12em]",
              failed
                ? "text-rose-300"
                : connected
                  ? "text-emerald-300"
                  : connecting
                    ? "text-amber-300"
                    : "text-zinc-500",
            )}
          >
            {wallet.message ?? "Ready"}
          </span>
        </span>

        {/* the status indicator */}
        <span className="flex shrink-0 items-center gap-2">
          {failed && (
            <span className="flex items-center gap-1.5 font-display text-[10px] font-bold uppercase tracking-[0.14em] text-rose-300">
              <RefreshCw className="h-3 w-3" aria-hidden />
              Retry
            </span>
          )}
          {connecting && (
            <Loader2 className="h-4 w-4 animate-spin text-amber-300" aria-hidden />
          )}
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              failed
                ? "bg-rose-400"
                : connected
                  ? "bg-emerald-400"
                  : connecting
                    ? "animate-pulse bg-amber-300"
                    : missing
                      ? "bg-zinc-700"
                      : "bg-zinc-600",
            )}
            aria-hidden
          />
        </span>
      </button>
    </li>
  );
}

/* ------------------------------------------------------- connected panel */

function ConnectedPanel({
  address,
  balance,
  chainId,
  wrongNetwork,
  onDisconnect,
}: {
  address?: `0x${string}`;
  balance: string;
  chainId?: number;
  wrongNetwork: boolean;
  onDisconnect: () => void;
}) {
  return (
    <div className="p-2">
      <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/[0.06] px-4 py-4">
        <p className="stat-label text-emerald-300/80">Signed in as</p>
        <p className="mt-1.5 font-mono text-base font-bold text-white">
          {address ? truncateAddress(address) : "—"}
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="font-mono text-sm font-semibold text-amber-300">
            {balance}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-300">
            {chainId === monad.id
              ? "Monad Mainnet"
              : chainId === monadTestnet.id
                ? "Monad Testnet"
                : `Chain ${chainId ?? "—"}`}
          </span>
        </div>
      </div>

      {wrongNetwork && (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-500/[0.08] px-3.5 py-3 font-display text-xs text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          This wallet is on the wrong network - switch it to Monad to enter the
          arena.
        </p>
      )}

      <button
        type="button"
        onClick={onDisconnect}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 font-display text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300 transition hover:border-rose-400/50 hover:bg-rose-500/10 hover:text-rose-200"
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden />
        Disconnect
      </button>
    </div>
  );
}
