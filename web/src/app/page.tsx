"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useConfig } from "wagmi";
import { readContract } from "wagmi/actions";
import { Swords } from "lucide-react";
import { ArenaHeader } from "@/components/ArenaHeader";
import { CreateDuelModal } from "@/components/CreateDuelModal";
import { DuelBoard, type ArenaDuel } from "@/components/DuelBoard";
import { vibeCheckPassed } from "@/components/VibeCheckGate";
import { setChogScene } from "@/lib/chogTheme";
import { BATTLE_ROSTER } from "@/config/fighterModels";
import { CHOG_ARENA_ADDRESS, chogArenaAbi } from "@/contracts";

/**
 * The arena roster — the two characters that ship a rigged 3D Mixamo model.
 * Every card maps 1:1 to its own character id and asset.
 */
const ROSTER = BATTLE_ROSTER;

export default function Home() {
  const [duels, setDuels] = useState<ArenaDuel[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  /* the CWO Vibe Check screening lives on its own route — if this session
   * has not cleared it, bounce to /vibe-check before the arena loads. */
  const [screened, setScreened] = useState(false);
  const router = useRouter();
  const { address } = useAccount();
  const config = useConfig();

  useEffect(() => {
    if (vibeCheckPassed()) {
      setScreened(true);
      /* The lobby is where the theme lives at its ambient level. */
      setChogScene("lobby");
    } else {
      router.replace("/vibe-check");
    }
  }, [router]);

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

  /* hold the arena back until the screening check resolves */
  if (!screened) {
    return <div className="min-h-[100dvh] w-full bg-zinc-950" />;
  }

  return (
    <>
      <ArenaHeader />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        {/* Create Duel CTA — pure CSS arena glow, no flat background images */}
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-900 p-8 text-center shadow-[0_0_60px_rgba(244,63,94,0.08)]">
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at 50% 120%, rgba(168,85,247,0.35), transparent 55%), radial-gradient(ellipse at 15% 0%, rgba(236,72,153,0.22), transparent 50%), linear-gradient(180deg, #0b0616 0%, #12081f 60%, #05030c 100%)",
            }}
            aria-hidden
          />
          <div
            className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/35 to-black/70"
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

        <DuelBoard
          duels={duels}
          onDuelSettled={handleSettled}
          onCreateDuel={() => setCreateOpen(true)}
          roster={ROSTER}
        />
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