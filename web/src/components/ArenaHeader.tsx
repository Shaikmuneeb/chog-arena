"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useBalance,
  useChainId,
  useReadContract,
} from "wagmi";
import { Wallet } from "lucide-react";
import {
  CHOG_NFT_ADDRESS,
  iChogNftAbi,
} from "@/contracts";
import {
  FighterAvatarBadge,
  useFighterProfile,
} from "@/context/FighterProfileContext";
import { ProfileModal } from "./ProfileModal";
import { ThemeMuteButton } from "./ThemeMuteButton";
import { WalletConnectModal } from "./WalletConnectModal";
import { monad, monadTestnet } from "@/config/monadChain";
import { cn, truncateAddress } from "@/lib/utils";

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Arena branding bar + wallet controls + fighter status card.
 *
 * Wallet state is fully driven by wagmi:
 * - useAccount  → address / isConnected
 * - useBalance  → native MON balance for the connected address/chain
 *
 * The wallet picker lives in WalletConnectModal (and the connection state
 * machine in useWalletConnection) so the header stays a status bar.
 *
 * The wallet area is gated behind a `mounted` flag so the server render and
 * the first client render match (no hydration mismatch on address/balance).
 */
export function ArenaHeader() {
  const [mounted, setMounted] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const { getProfile } = useFighterProfile();
  // Authoritative wallet chain for the network pill (not the optimistic
  // config chain from useChainId).
  const appChainId = useChainId();
  const chainId = walletChainId ?? appChainId;
  const { data: balance } = useBalance({
    address,
    chainId,
    query: { enabled: Boolean(address), refetchInterval: 15_000 },
  });

  useEffect(() => {
    setMounted(true);
  }, []);

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

            {/* the theme track keeps looping in the lobby - let the
                visitor turn it down or off */}
            <ThemeMuteButton />

            {!mounted ? (
              /* SSR-safe skeleton until client hydration completes */
              <div
                className="h-9 w-40 animate-pulse rounded-full bg-white/5"
                aria-hidden
              />
            ) : !isConnected ? (
              /* ---------- Connect: the glass wallet picker ---------- */
              <button
                type="button"
                onClick={() => setWalletOpen(true)}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-fuchsia-600 to-pink-600 px-4 py-2 font-display text-xs font-bold uppercase tracking-[0.16em] text-white shadow-neon-edge transition-all hover:from-fuchsia-500 hover:to-pink-500"
              >
                <Wallet className="h-4 w-4" aria-hidden />
                Connect
              </button>
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

                <button
                  type="button"
                  onClick={() => setWalletOpen(true)}
                  className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 backdrop-blur-md transition hover:border-fuchsia-400/50 hover:bg-fuchsia-500/10"
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", network.dot)} />
                  <span className="font-mono text-xs font-semibold text-zinc-100">
                    {address ? truncateAddress(address) : ""}
                  </span>
                  <span className="hidden font-mono text-xs font-medium text-amber-300 sm:inline">
                    {monBalance}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <WalletConnectModal
        open={walletOpen}
        onClose={() => setWalletOpen(false)}
      />

      <ProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
      />
    </>
  );
}
