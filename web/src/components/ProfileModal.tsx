"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { Check, X } from "lucide-react";
import {
  AVATARS,
  FIGHTER_TITLES,
  getAvatar,
  useFighterProfile,
} from "@/context/FighterProfileContext";
import { cn, truncateAddress } from "@/lib/utils";
import { pushToast } from "./Toast";

type ProfileModalProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * Fighter identity editor: callsign (max 16 alphanumeric), neon avatar,
 * and title badge — persisted per-wallet in localStorage with instant
 * reactivity across the app.
 */
export function ProfileModal({ open, onClose }: ProfileModalProps) {
  const { address, isConnected } = useAccount();
  const { getProfile, updateProfile } = useFighterProfile();
  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState<string>(AVATARS[0].id);
  const [title, setTitle] = useState<string>(FIGHTER_TITLES[0]);

  /* Sync form with the current profile each time the modal opens. */
  useEffect(() => {
    if (!open || !address) return;
    const current = getProfile(address);
    setUsername(current?.username ?? "");
    setAvatar(current?.avatar ?? AVATARS[0].id);
    setTitle(current?.title ?? FIGHTER_TITLES[0]);
  }, [open, address, getProfile]);

  if (!open) return null;

  function save() {
    if (!address) return;
    updateProfile(address, { username, avatar, title });
    pushToast({
      kind: "success",
      message: username
        ? `Fighter profile saved — welcome, ${username}`
        : "Fighter profile saved",
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-zinc-950/80 p-4 backdrop-blur-xl"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-red-500/30 bg-zinc-950/90 p-6 shadow-[0_0_50px_-10px_rgba(239,68,68,0.25)] animate-rise-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="bg-gradient-to-r from-red-400 via-orange-300 to-amber-200 bg-clip-text text-xl font-extrabold tracking-wide text-transparent">
              FIGHTER PROFILE
            </h2>
            <p className="mt-1 font-mono text-[11px] text-zinc-500">
              {address ? truncateAddress(address) : "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!isConnected ? (
          <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-3 text-center text-xs text-amber-200">
            Connect a wallet to edit your fighter profile.
          </p>
        ) : (
          <>
            {/* Callsign */}
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Fighter Callsign
              <input
                type="text"
                value={username}
                maxLength={16}
                placeholder="e.g. MonadReaper"
                onChange={(e) =>
                  setUsername(
                    e.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16),
                  )
                }
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-base font-bold text-zinc-100 outline-none transition placeholder:font-normal placeholder:text-zinc-700 focus:border-red-500/70 focus:shadow-[0_0_18px_rgba(239,68,68,0.35)]"
              />
              <span className="mt-1 block text-[10px] font-normal text-zinc-600">
                Max 16 letters/numbers — falls back to your wallet address if
                empty.
              </span>
            </label>

            {/* Avatar */}
            <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Avatar
            </p>
            <div className="mt-2 grid grid-cols-6 gap-2.5">
              {AVATARS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAvatar(a.id)}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-xl border-2 text-2xl transition",
                    avatar === a.id
                      ? "scale-110"
                      : "opacity-60 hover:opacity-100",
                  )}
                  style={{
                    borderColor: a.hex,
                    background: `radial-gradient(circle at 30% 30%, ${a.hex}33, transparent 70%), #09090b`,
                    boxShadow: avatar === a.id ? `0 0 16px ${a.hex}88` : "none",
                  }}
                  aria-pressed={avatar === a.id}
                >
                  {a.emoji}
                </button>
              ))}
            </div>

            {/* Title */}
            <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Fighter Title
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {FIGHTER_TITLES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTitle(t)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                    title === t
                      ? "border-red-500/60 bg-red-500/15 text-red-200 shadow-[0_0_12px_rgba(239,68,68,0.35)]"
                      : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Preview + save */}
            <div className="mt-6 flex items-center gap-3 rounded-xl border border-white/5 bg-black/40 px-4 py-3">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-xl border-2 text-lg"
                style={{
                  borderColor: getAvatar(avatar).hex,
                  background: `radial-gradient(circle at 30% 30%, ${getAvatar(avatar).hex}33, transparent 70%), #09090b`,
                  boxShadow: `0 0 12px ${getAvatar(avatar).hex}66`,
                }}
                aria-hidden
              >
                {getAvatar(avatar).emoji}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-zinc-100">
                  {username || truncateAddress(address ?? "")}
                </p>
                <p className="text-[11px] text-zinc-500">{title}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={save}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-orange-600 py-3 text-sm font-extrabold tracking-wide text-white shadow-[0_0_24px_rgba(239,68,68,0.4)] transition hover:from-red-500 hover:via-rose-500 hover:to-orange-500"
            >
              <Check className="h-4 w-4" aria-hidden />
              SAVE FIGHTER PROFILE
            </button>
          </>
        )}
      </div>
    </div>
  );
}
