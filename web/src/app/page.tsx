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
      /* The lobby is where the theme lives at its ambient level. The
       * cinematic hands it over on its way out; a visitor who skipped the
       * screening picks it up here instead. */
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
    return <div className="min-h-[100dvh] w-full bg-black" />;
  }

  return (
    <>
      <ArenaHeader />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        {/* Create Duel CTA — OLED glass panel with a neon rim */}
        <section className="glass-panel animate-rise-in px-6 py-10 text-center sm:px-10 sm:py-14">
          {/* ambient bloom + scanlines + corner brackets */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at 50% 118%, rgba(168,85,247,0.42), transparent 58%), radial-gradient(ellipse at 12% -10%, rgba(236,72,153,0.24), transparent 52%), radial-gradient(ellipse at 88% -10%, rgba(34,211,238,0.16), transparent 50%)",
            }}
            aria-hidden
          />
          <div className="scanlines pointer-events-none absolute inset-0" aria-hidden />
          <div className="bracket-frame" aria-hidden />

          <div className="relative z-10">
            <p className="stat-label text-fuchsia-300/80">
              Chog Arena // On-Chain Deathmatch
            </p>
            <h1 className="mt-3 font-display text-4xl font-bold uppercase leading-[1.05] tracking-tight text-white sm:text-5xl">
              Stake MON. Fight.{" "}
              <span className="neon-title drop-shadow-[0_0_28px_rgba(217,70,239,0.55)]">
                Instant settlement.
              </span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl font-display text-sm font-medium leading-relaxed text-zinc-400">
              Open a duel or accept a challenge — the arena settles on the spot.
              Chog NFT holders resurrect with Second Wind (20%) and fight fee-free.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="btn-neon"
              >
                <Swords className="h-4 w-4" aria-hidden />
                Create Duel
              </button>
              <span className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-zinc-300 backdrop-blur-md">
                {ROSTER.length} Fighters Online
              </span>
            </div>
          </div>
        </section>

        {/* Key protocol stats — the dashboard readout strip */}
        <section className="glass-panel grid grid-cols-1 divide-y divide-white/5 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="px-5 py-4">
            <p className="stat-label">Protocol Rake</p>
            <p className="stat-value mt-1 text-2xl font-bold text-fuchsia-300">
              2.00<span className="text-sm text-zinc-500">%</span>
            </p>
          </div>
          <div className="px-5 py-4">
            <p className="stat-label">Second Wind</p>
            <p className="stat-value mt-1 text-2xl font-bold text-pink-300">
              20<span className="text-sm text-zinc-500">%</span>
            </p>
          </div>
          <div className="px-5 py-4">
            <p className="stat-label">Settlement</p>
            <p className="stat-value mt-1 text-2xl font-bold text-cyan-300">
              INSTANT
            </p>
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