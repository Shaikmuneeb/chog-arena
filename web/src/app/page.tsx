import { ShieldCheck, Swords, Wallet } from "lucide-react";
import {
  CHOG_SHIELD_ADDRESS,
  PREDICTION_MARKET_ADDRESS,
} from "@/contracts";

const features = [
  {
    icon: Swords,
    title: "Prediction Markets",
    body: "Bet YES or NO on any question. Winners split the pot pro-rata; the protocol rakes 2.5% of the losing pool.",
  },
  {
    icon: ShieldCheck,
    title: "Chog Shield",
    body: "Losing stakes are recorded on-chain. Chog NFT holders claim a 20% loss rebate, capped at 50 MON per claim with a 7-day cooldown.",
  },
  {
    icon: Wallet,
    title: "Treasury Split",
    body: "60% of every protocol fee flows into the Chog Shield pool, 40% to the treasury — automatically at market resolution.",
  },
];

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="space-y-4 pt-8 text-center">
        <h1 className="bg-gradient-to-r from-purple-300 via-fuchsia-200 to-purple-300 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-5xl">
          Chog Arena
        </h1>
        <p className="mx-auto max-w-2xl text-zinc-400">
          Binary prediction markets on <span className="text-zinc-200">Monad</span>,
          backed by the Chog Shield loss-rebate system.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {features.map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-white/5 bg-zinc-900/60 p-5 text-left"
          >
            <f.icon className="mb-3 h-6 w-6 text-purple-400" aria-hidden />
            <h2 className="mb-1.5 font-semibold text-zinc-100">{f.title}</h2>
            <p className="text-sm leading-relaxed text-zinc-400">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-white/5 bg-zinc-900/40 p-5 text-center text-xs text-zinc-500">
        <p>
          Contracts (placeholder addresses — replace after deploying via{" "}
          <code className="text-zinc-400">script/Deploy.s.sol</code>):
        </p>
        <p className="mt-2 font-mono">
          ChogShield {CHOG_SHIELD_ADDRESS} · PredictionMarket{" "}
          {PREDICTION_MARKET_ADDRESS}
        </p>
      </section>
    </div>
  );
}
