import Link from "next/link";
import { Swords } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4 text-center">
      <div className="max-w-md rounded-3xl border border-white/10 bg-zinc-900/80 p-8 backdrop-blur shadow-2xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500">
          <Swords className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Arena Match Not Found</h2>
        <p className="text-sm text-zinc-400 mb-6">
          The requested duel or page does not exist in Chog Arena. Return to the battlefield.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-rose-500"
        >
          Return to Arena
        </Link>
      </div>
    </div>
  );
}
