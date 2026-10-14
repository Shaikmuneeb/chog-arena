"use client";

import { useState } from "react";
import { ChevronDown, LogOut, Shield, Wallet } from "lucide-react";
import { useAccount, useChainId, useConnect, useDisconnect, useReadContract } from "wagmi";
import { CHOG_NFT_ADDRESS, iChogNftAbi } from "@/contracts";
import { monad, monadTestnet } from "@/config/monadChain";
import { cn, truncateAddress } from "@/lib/utils";

const ZERO = "0x0000000000000000000000000000000000000000";

export function Navbar() {
  const [connectOpen, setConnectOpen] = useState(false);
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  const network =
    chainId === monad.id
      ? { label: "Monad Mainnet", dot: "bg-emerald-400" }
      : chainId === monadTestnet.id
        ? { label: "Monad Testnet", dot: "bg-amber-400" }
        : { label: "Unsupported Network", dot: "bg-red-400" };

  // Live Chog Shield status: does the connected wallet hold >= 1 Chog NFT?
  const { data: nftBalance } = useReadContract({
    address: CHOG_NFT_ADDRESS,
    abi: iChogNftAbi,
    functionName: "balanceOf",
    args: [address ?? ZERO],
    query: {
      enabled: Boolean(address),
      refetchInterval: 15_000,
    },
  });

  const shieldActive = typeof nftBalance === "bigint" && nftBalance > 0n;

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-zinc-950/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-fuchsia-600 text-lg shadow-lg shadow-purple-500/25">
            ⚔️
          </span>
          <span className="text-lg font-bold tracking-tight text-zinc-50">
            Chog Arena
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Live Chog Shield badge */}
          {shieldActive && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/40 bg-purple-500/15 px-3 py-1 text-xs font-semibold text-purple-200 shadow-[0_0_14px_rgba(168,85,247,0.55)] animate-pulse">
              <Shield className="h-3.5 w-3.5" aria-hidden />
              🛡️ Chog Shield Active
            </span>
          )}

          {/* Network indicator */}
          <span className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-zinc-300 sm:inline-flex">
            <span className={cn("h-1.5 w-1.5 rounded-full", network.dot)} />
            {network.label}
          </span>

          {/* Wallet */}
          {!isConnected ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setConnectOpen((v) => !v)}
                className="inline-flex items-center gap-2 rounded-full bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-purple-600/25 transition hover:bg-purple-500"
              >
                <Wallet className="h-4 w-4" aria-hidden />
                Connect
                <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
              </button>

              {connectOpen && (
                <div className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-white/10 bg-zinc-900 shadow-2xl shadow-black/50">
                  {connectors.map((connector) => (
                    <button
                      key={connector.uid}
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        connect({ connector });
                        setConnectOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-zinc-200 transition hover:bg-white/5 disabled:opacity-50"
                    >
                      <Wallet className="h-4 w-4 text-zinc-400" aria-hidden />
                      {connector.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs text-zinc-200">
                <span className={cn("h-1.5 w-1.5 rounded-full", network.dot)} />
                {address ? truncateAddress(address) : ""}
              </span>
              <button
                type="button"
                onClick={() => disconnect()}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/10"
                title="Disconnect wallet"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden />
                Disconnect
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
