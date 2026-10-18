"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { useAccount, useConfig } from "wagmi";
import { readContract } from "wagmi/actions";
import { Swords } from "lucide-react";
import { ArenaHeader } from "@/components/ArenaHeader";
import { CreateDuelModal } from "@/components/CreateDuelModal";
import { DuelBoard, type ArenaDuel } from "@/components/DuelBoard";
import { CHOG_ARENA_ADDRESS, chogArenaAbi } from "@/contracts";

// Dynamic import with ssr: false for Three.js WebGL canvas
const FighterArena3D = dynamic(
  () => import("@/components/FighterArena3D").then((mod) => mod.FighterArena3D),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[480px] w-full items-center justify-center rounded-3xl border border-purple-500/20 bg-zinc-950 text-purple-400">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
          <p className="text-sm font-semibold">Initializing 3D Void Arena...</p>
        </div>
      </div>
    ),
  }
);

export default function Home() {
  /* Only real duels live here — the lobby reads them from ChogArena. */
  const [duels, setDuels] = useState<ArenaDuel[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"dojo" | "lobby">("dojo");
  const { address } = useAccount();
  const config = useConfig();

  const handleCreated = useCallback(
    async (betAmount: bigint) => {
      let id = Math.max(0, ...duels.map((d) => d.id)) + 1;
      try {
        const counter = await readContract(config, {
          address: CHOG_ARENA_ADDRESS,
          abi: chogArenaAbi,
          functionName: "duelCounter",
        });
        id = Number(counter as bigint) + 1;
      } catch {
        /* demo mode — optimistic local id */
      }
      setDuels((prev) => [
        {
          id,
          creator: address ?? "0x0000000000000000000000000000000000000000",
          betAmount,
          status: "open",
          mine: true,
        },
        ...prev,
      ]);
    },
    [address, config, duels],
  );

  const handleSettled = useCallback((duelId: number) => {
    setDuels((prev) => prev.filter((d) => d.id !== duelId));
  }, []);

  return (
    <>
      <ArenaHeader />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        {/* Arena Mode Switcher */}
        <div className="flex items-center justify-center">
          <div className="inline-flex rounded-2xl border border-white/10 bg-zinc-900/90 p-1.5 shadow-xl backdrop-blur">
            <button
              type="button"
              onClick={() => setActiveTab("dojo")}
              className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition ${
                activeTab === "dojo"
                  ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/30"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Swords className="h-4 w-4" />
              3D Combat Dojo (Void Lord James)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("lobby")}
              className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition ${
                activeTab === "lobby"
                  ? "bg-rose-600 text-white shadow-lg shadow-rose-600/30"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Swords className="h-4 w-4" />
              On-Chain Duels & Lobby
            </button>
          </div>
        </div>

        {activeTab === "dojo" ? (
          <FighterArena3D />
        ) : (
          <>
            {/* Create Duel CTA */}
            <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-900 p-8 text-center shadow-[0_0_60px_rgba(244,63,94,0.08)]">
              {/* Arena hero backdrop */}
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: "url(/assets/arena-background.jpg)" }}
                aria-hidden
              />
              {/* Dark gradient overlay — headline & button stay crisp */}
              <div
                className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/45 to-black/75"
                aria-hidden
              />
              <div className="relative z-10">
                <h1 className="text-4xl font-extrabold tracking-tight text-zinc-50 sm:text-5xl">
                  Stake MON. Fight.{" "}
                  <span className="bg-gradient-to-r from-rose-300 to-orange-300 bg-clip-text text-transparent">
                    Instant settlement.
                  </span>
                </h1>
                <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-400">
                  Open a duel or accept a challenge — the arena settles on the spot.
                  Chog NFT holders resurrect with Second Wind (20%) and fight fee-free.
                </p>
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-8 py-3.5 text-base font-bold text-white shadow-xl shadow-rose-600/30 transition hover:bg-rose-500"
                >
                  <Swords className="h-5 w-5" aria-hidden />
                  Create Duel
                </button>
              </div>
            </section>

            <DuelBoard duels={duels} onDuelSettled={handleSettled} />
          </>
        )}
      </main>

      <CreateDuelModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(betAmount) => {
          void handleCreated(betAmount);
        }}
      />
    </>
  );
}
