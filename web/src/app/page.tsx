"use client";

import { useCallback, useState } from "react";
import { useAccount, useConfig } from "wagmi";
import { readContract } from "wagmi/actions";
import { Swords } from "lucide-react";
import { ArenaHeader } from "@/components/ArenaHeader";
import { CreateDuelModal } from "@/components/CreateDuelModal";
import { DuelBoard, type ArenaDuel } from "@/components/DuelBoard";
import { CHOG_ARENA_ADDRESS, chogArenaAbi } from "@/contracts";

export default function Home() {
  const [duels, setDuels] = useState<ArenaDuel[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
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
        {/* Create Duel CTA */}
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-900 p-8 text-center shadow-[0_0_60px_rgba(244,63,94,0.08)]">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: "url(/assets/arena-background.jpg)" }}
            aria-hidden
          />
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