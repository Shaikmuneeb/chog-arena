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
import {
  CHOG_ARENA_ADDRESS,
  CHOG_NFT_ADDRESS,
  chogArenaAbi,
  iChogNftAbi,
} from "@/contracts";
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

  /* Liveness probe: a successful duelCounter read means the deployed
   * ChogArena contract is reachable on the current chain. */
  const { data: arenaCounter, isError: arenaProbeFailed } = useReadContract({
    address: CHOG_ARENA_ADDRESS,
    abi: chogArenaAbi,
    functionName: "duelCounter",
    query: { refetchInterval: 20_000 },
  });
  const arenaOnline = arenaCounter !== undefined && !arenaProbeFailed;

  const secondWind = typeof nftBalance === "bigint" && nftBalance > 0n;
  const monBalance = balance
    ? `${Number(balance.formatted).toLocaleString("en-US", { maximumFractionDigits: 3 })} MON`
    : "—";

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/70 backdrop-blur-xl">
        {/* neon hairline under the bar */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-fuchsia-500/70 to-transparent"
          aria-hidden
        />
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-gradient-to-br from-fuchsia-600 to-pink-600 text-base shadow-glow-purple">
              ⚔️
            </span>
            <span className="font-display text-base font-bold uppercase tracking-[0.18em] text-white">
              CHOG ARENA
              <span className="ml-2 hidden font-mono text-[10px] font-medium tracking-[0.3em] text-fuchsia-300/80 sm:inline">
                // 1V1 DEATHMATCH
              </span>
            </span>
            {/* Live arena status — probe the deployed contract */}
            {mounted && (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wide",
                  arenaOnline
                    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300 shadow-glow-cyan"
                    : "border-white/10 bg-white/5 text-zinc-500",
                )}
                title={`ChogArena @ ${CHOG_ARENA_ADDRESS} (Monad Mainnet)`}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    arenaOnline
                      ? "animate-pulse bg-emerald-400"
                      : "bg-zinc-600",
                  )}
                />
                {arenaOnline ? (
                  <>
                    <span className="uppercase tracking-wider">Arena Online</span>
                    <span className="text-emerald-300/40">·</span>
                    <span>{truncateAddress(CHOG_ARENA_ADDRESS)}</span>
                  </>
                ) : (
                  <span className="uppercase tracking-wider">Arena Offline</span>
                )}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Compact fighter status badge */}
            {mounted && (
              <span
                className={cn(
                  "hidden items-center gap-1.5 rounded-full border px-3 py-1 font-display text-[11px] font-semibold uppercase tracking-[0.14em] sm:inline-flex",
                  secondWind
                    ? "border-pink-400/40 bg-pink-500/10 text-pink-200 shadow-glow-pink"
                    : "border-white/10 bg-white/5 text-zinc-300",
                )}
              >
                {secondWind ? "🔥 SECOND WIND" : "⚡ 2% ARENA FEE"}
              </span>
            )}
            {/* Network indicator — gated on mount to stay hydration-safe */}
            {mounted && (
              <span className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-[11px] font-medium text-zinc-300 backdrop-blur-md sm:inline-flex">
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
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-fuchsia-600 to-pink-600 px-4 py-2 font-display text-xs font-bold uppercase tracking-[0.16em] text-white shadow-neon-edge transition-all hover:from-fuchsia-500 hover:to-pink-500"
                >
                  <Wallet className="h-4 w-4" aria-hidden />
                  Connect
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
                </button>

                {menuOpen && (
                  <div className="glass-deep absolute right-0 mt-2 w-56 overflow-hidden rounded-xl shadow-2xl shadow-black/60">
                    <p className="stat-label border-b border-white/5 px-4 py-2.5">
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
                          className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left font-display text-sm text-zinc-200 transition hover:bg-fuchsia-500/10 hover:text-white disabled:opacity-50"
                        >
                          <Wallet className="h-4 w-4 text-zinc-400" aria-hidden />
                          <span className="flex-1">{connector.name}</span>
                          {isPending && (
                            <span className="font-mono text-[10px] text-zinc-500">
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
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3 backdrop-blur-md transition hover:border-fuchsia-400/50 hover:bg-fuchsia-500/10"
                >
                  <FighterAvatarBadge address={address} size="sm" />
                  <span className="max-w-28 truncate font-display text-xs font-bold text-zinc-100">
                    {getProfile(address)?.username ?? "Set Name"}
                  </span>
                </button>

                <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 backdrop-blur-md transition hover:border-fuchsia-400/50 hover:bg-fuchsia-500/10"
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", network.dot)} />
                  <span className="font-mono text-xs font-semibold text-zinc-100">
                    {address ? truncateAddress(address) : ""}
                  </span>
                  <span className="hidden font-mono text-xs font-medium text-amber-300 sm:inline">
                    {monBalance}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
                </button>

                {menuOpen && (
                  <div className="glass-deep absolute right-0 mt-2 w-60 overflow-hidden rounded-xl shadow-2xl shadow-black/60">
                    <div className="border-b border-white/5 px-4 py-3">
                      <p className="font-mono text-xs font-semibold text-zinc-100">
                        {address ? truncateAddress(address) : ""}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Balance:{" "}
                        <span className="font-mono font-semibold text-amber-300">
                          {monBalance}
                        </span>
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-zinc-500">
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
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left font-display text-sm text-zinc-200 transition hover:bg-rose-500/10 hover:text-rose-200"
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

      <ProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
      />
    </>
  );
}
