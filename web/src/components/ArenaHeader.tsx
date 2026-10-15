"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useBalance,
  useChainId,
  useConnect,
  useDisconnect,
  useReadContract,
} from "wagmi";
import { ChevronDown, LogOut, Swords, Wallet } from "lucide-react";
import { CHOG_NFT_ADDRESS, iChogNftAbi } from "@/contracts";
import {
  FighterAvatarBadge,
  useFighterProfile,
} from "@/context/FighterProfileContext";
import { ProfileModal } from "./ProfileModal";
import { monad, monadTestnet } from "@/config/monadChain";
import { cn, truncateAddress } from "@/lib/utils";

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Arena branding bar + wallet controls + fighter status card.
 *
 * Wallet state is fully driven by wagmi:
 * - useAccount  → address / isConnected
 * - useConnect  → connectors + connect({ connector }) (EIP-6963 aware)
 * - useBalance  → native MON balance for the connected address/chain
 * - useDisconnect → dropdown disconnect
 *
 * The wallet area is gated behind a `mounted` flag so the server render and
 * the first client render match (no hydration mismatch on address/balance).
 */
export function ArenaHeader() {
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const { getProfile } = useFighterProfile();
  // Authoritative wallet chain for the network pill (not the optimistic
  // config chain from useChainId).
  const appChainId = useChainId();
  const chainId = walletChainId ?? appChainId;
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({
    address,
    chainId,
    query: { enabled: Boolean(address), refetchInterval: 15_000 },
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close the dropdown on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick() {
      setMenuOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [menuOpen]);

  const network =
    chainId === monad.id
      ? { label: "Monad Mainnet", dot: "bg-emerald-400" }
      : chainId === monadTestnet.id
        ? { label: "Monad Testnet", dot: "bg-amber-400" }
        : { label: "Unsupported Network", dot: "bg-red-400" };

  const { data: nftBalance, isLoading: nftLoading } = useReadContract({
    address: CHOG_NFT_ADDRESS,
    abi: iChogNftAbi,
    functionName: "balanceOf",
    args: [address ?? ZERO],
    query: { enabled: Boolean(address), refetchInterval: 15_000 },
  });

  const secondWind = typeof nftBalance === "bigint" && nftBalance > 0n;
  const monBalance = balance
    ? `${Number(balance.formatted).toLocaleString("en-US", { maximumFractionDigits: 3 })} MON`
    : "—";

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-white/5 bg-zinc-950/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rose-600 to-orange-500 text-lg shadow-lg shadow-rose-600/25">
              ⚔️
            </span>
            <span className="text-lg font-extrabold tracking-tight text-zinc-50">
              CHOG ARENA{" "}
              <span className="bg-gradient-to-r from-rose-400 to-orange-300 bg-clip-text text-transparent">
                // 1V1 DEATHMATCH
              </span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Network indicator — gated on mount to stay hydration-safe */}
            {mounted && (
              <span className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-zinc-300 sm:inline-flex">
                <span className={cn("h-1.5 w-1.5 rounded-full", network.dot)} />
                {network.label}
              </span>
            )}

            {!mounted ? (
              /* SSR-safe skeleton until client hydration completes */
              <div
                className="h-9 w-40 animate-pulse rounded-full bg-white/5"
                aria-hidden
              />
            ) : !isConnected ? (
              /* ---------- Connect: connector list (EIP-6963 + injected) ---------- */
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-500"
                >
                  <Wallet className="h-4 w-4" aria-hidden />
                  Connect
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
                </button>

                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-zinc-900 shadow-2xl shadow-black/50">
                    <p className="border-b border-white/5 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      Choose a wallet
                    </p>
                    {connectors.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-zinc-500">
                        No browser wallets detected. Install MetaMask, Rabby,
                        or Backpack and reload.
                      </p>
                    ) : (
                      connectors.map((connector) => (
                        <button
                          key={connector.uid}
                          type="button"
                          disabled={isPending}
                          onClick={() => {
                            connect({ connector });
                            setMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-zinc-200 transition hover:bg-white/5 disabled:opacity-50"
                        >
                          <Wallet className="h-4 w-4 text-zinc-400" aria-hidden />
                          <span className="flex-1">{connector.name}</span>
                          {isPending && (
                            <span className="text-[10px] text-zinc-500">
                              connecting…
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* ---------- Connected: profile button + address/balance pill ---------- */
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setProfileOpen(true)}
                  title="Edit Fighter Name / Profile"
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3 transition hover:bg-white/10"
                >
                  <FighterAvatarBadge address={address} size="sm" />
                  <span className="max-w-28 truncate text-xs font-bold text-zinc-100">
                    {getProfile(address)?.username ?? "Set Name"}
                  </span>
                </button>

                <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 transition hover:bg-white/10"
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", network.dot)} />
                  <span className="font-mono text-xs font-semibold text-zinc-100">
                    {address ? truncateAddress(address) : ""}
                  </span>
                  <span className="hidden text-xs font-medium text-amber-200 sm:inline">
                    {monBalance}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
                </button>

                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-white/10 bg-zinc-900 shadow-2xl shadow-black/50">
                    <div className="border-b border-white/5 px-4 py-3">
                      <p className="font-mono text-xs font-semibold text-zinc-100">
                        {address ? truncateAddress(address) : ""}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Balance:{" "}
                        <span className="font-semibold text-amber-200">
                          {monBalance}
                        </span>
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500">
                        <span
                          className={cn("h-1.5 w-1.5 rounded-full", network.dot)}
                        />
                        {network.label}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        disconnect();
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-zinc-200 transition hover:bg-white/5"
                    >
                      <LogOut className="h-4 w-4 text-zinc-400" aria-hidden />
                      Disconnect
                    </button>
                  </div>
                )}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Fighter status card */}
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <div
          className={cn(
            "flex items-center gap-3 rounded-2xl border px-5 py-3.5 transition",
            secondWind
              ? "animate-second-wind border-rose-400/40 bg-gradient-to-r from-rose-950/70 via-zinc-900 to-orange-950/50"
              : "border-white/10 bg-zinc-900/60",
          )}
        >
          {secondWind ? (
            <>
              <Swords className="h-5 w-5 shrink-0 text-rose-300" aria-hidden />
              <p className="text-sm font-bold text-rose-100">
                🔥 SECOND WIND ACTIVE{" "}
                <span className="font-medium text-rose-200/80">
                  (20% Resurrect Chance &amp; 0% Fees)
                </span>
              </p>
            </>
          ) : (
            <>
              <Swords className="h-5 w-5 shrink-0 text-zinc-500" aria-hidden />
              <p className="text-sm font-semibold text-zinc-300">
                {!mounted
                  ? "Syncing fighter status…"
                  : !isConnected
                    ? "Connect your wallet to sync fighter status."
                    : nftLoading
                      ? "Checking Chog NFT balance…"
                      : "⚡ Standard Fighter (2% Arena Fee)"}
              </p>
            </>
          )}
        </div>
      </div>

      <ProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
      />
    </>
  );
}
