"use client";

import { useCallback, useState } from "react";
import { useAccount, useConfig } from "wagmi";
import { readContract } from "wagmi/actions";
import { Swords } from "lucide-react";
import { ArenaHeader } from "@/components/ArenaHeader";
import { CreateDuelModal } from "@/components/CreateDuelModal";
import { DuelBoard, type ArenaDuel } from "@/components/DuelBoard";
import { CHOG_ARENA_ADDRESS, chogArenaAbi } from "@/contracts";

/** Demo duels — replaced by live reads once ChogArena is deployed. */
const INITIAL_DUels: ArenaDuel[] = [
  {
    id: 1,
    creator: "0x4F3A8C2b9E1d7A6f0C5b2D9e8F1a3B4c5D6e7F80",
    betAmount: 500_000_000_000_000_000n, // 0.5 MON
    status: "open",
  },
  {
    id: 2,
    creator: "0x9B7E4d2C1a8F3e6B0c9D2a5F8e1B4c7D0a3F6E91",
    betAmount: 1_000_000_000_000_000_000n, // 1 MON
    status: "open",
  },
  {
    id: 3,
    creator: "0xD1C47A9b3E6f2C8a0D5B1e4F7a2C9b6E3d8F5A12",
    betAmount: 2_500_000_000_000_000_000n, // 2.5 MON
    status: "open",
  },
  {
    id: 4,
    creator: "0x77AB3c9F1e4D7a0B5c8E2f6A9d3C0b7E4f1A8D34",
    betAmount: 100_000_000_000_000_000n, // 0.1 MON
    status: "open",
  },
];

export default function Home() {
  const [duels, setDuels] = useState<ArenaDuel[]>(INITIAL_DUels);
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
      <main className="mx-auto max-w-6xl space-y-10 px-4 py-8">
        {/* Create Duel CTA */}
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-rose-950/70 via-zinc-900 to-orange-950/50 p-8 text-center shadow-[0_0_60px_rgba(244,63,94,0.08)]">
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
