"use client";

import { useEffect } from "react";
import { Swords, RotateCcw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Arena App Error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4 text-center">
      <div className="max-w-md rounded-3xl border border-rose-500/20 bg-zinc-900/90 p-8 backdrop-blur shadow-2xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500">
          <Swords className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Combat System Interrupted</h2>
        <p className="text-sm text-zinc-400 mb-6">
          An unexpected duel glitch occurred. Recover to resume combat.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-rose-500"
        >
          <RotateCcw className="h-4 w-4" />
          Recover Arena
        </button>
      </div>
    </div>
  );
}
