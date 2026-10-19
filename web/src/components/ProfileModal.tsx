"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { Check, ImagePlus, Link, Trash2, X } from "lucide-react";
import {
  FIGHTER_TITLES,
  useFighterProfile,
  type FighterClass,
} from "@/context/FighterProfileContext";
import {
  FIGHTER_CLASSES,
  FIGHTER_CLASS_META,
} from "@/config/fighterClasses";

import { cn, truncateAddress } from "@/lib/utils";
import { pushToast } from "./Toast";

type ProfileModalProps = {
  open: boolean;
  onClose: () => void;
};

/** Cover-crop + compress an uploaded image to a 160×160 JPEG data URL. */
function resizeImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Invalid image data"));
      img.onload = () => {
        const size = 160;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas not supported"));
          return;
        }
        // Center cover-crop to a square.
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Fighter identity editor: callsign, custom avatar (upload or image URL),
 * and title badge — persisted per-wallet with instant app-wide reactivity.
 */
export function ProfileModal({ open, onClose }: ProfileModalProps) {
  const { address, isConnected } = useAccount();
  const { getProfile, updateProfile } = useFighterProfile();
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [title, setTitle] = useState<string>(FIGHTER_TITLES[0]);
  const [fighterClass, setFighterClass] = useState<FighterClass>("chogzila");
  const [urlInput, setUrlInput] = useState("");
  const [previewFailed, setPreviewFailed] = useState(false);

  /* Sync form with the current profile each time the modal opens. */
  useEffect(() => {
    if (!open || !address) return;
    const current = getProfile(address);
    setUsername(current?.username ?? "");
    setAvatarUrl(current?.avatarUrl ?? "");
    setTitle(current?.title ?? FIGHTER_TITLES[0]);
    setFighterClass(current?.fighterClass ?? "chogzila");
    setUrlInput("");
    setPreviewFailed(false);
  }, [open, address, getProfile]);

  useEffect(() => {
    setPreviewFailed(false);
  }, [avatarUrl]);

  if (!open) return null;

  const initials = (
    username || (address ? address.slice(2, 4) : "??")
  ).slice(0, 2).toUpperCase();
  const hue = address ? parseInt(address.slice(2, 8), 16) % 360 : 280;
  const fallbackHex = `hsl(${hue} 75% 55%)`;

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      pushToast({ kind: "error", message: "Use a PNG, JPEG, WebP, or GIF image" });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      pushToast({ kind: "error", message: "Image too large (max 8 MB)" });
      return;
    }
    try {
      const dataUrl = await resizeImageFile(file);
      setAvatarUrl(dataUrl);
      pushToast({ kind: "success", message: "Avatar ready — Save to apply" });
    } catch {
      pushToast({ kind: "error", message: "Could not process that image" });
    }
  }

  function applyUrl() {
    const url = urlInput.trim();
    if (!url) return;
    const normalized = url.startsWith("ipfs://")
      ? `https://ipfs.io/ipfs/${url.slice("ipfs://".length)}`
      : url;
    if (!/^(https?:\/\/|data:image\/)/i.test(normalized)) {
      pushToast({ kind: "error", message: "Enter a valid http(s) or ipfs image link" });
      return;
    }
    setAvatarUrl(normalized);
    setUrlInput("");
  }

  function removeAvatar() {
    setAvatarUrl("");
    setUrlInput("");
  }

  function save() {
    if (!address) return;
    updateProfile(address, { username, avatarUrl, title, fighterClass });
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
        className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl border border-red-500/30 bg-zinc-950/90 p-6 shadow-[0_0_50px_-10px_rgba(239,68,68,0.25)] animate-rise-in"
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

            {/* Custom avatar uploader */}
            <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Fighter Avatar
            </p>
            <div className="mt-2 flex items-start gap-4">
              {/* Live preview */}
              <div
                className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2"
                style={{
                  borderColor: fallbackHex,
                  background: `radial-gradient(circle at 30% 30%, ${fallbackHex}33, transparent 70%), #09090b`,
                  boxShadow: `0 0 16px ${fallbackHex}66`,
                }}
              >
                {avatarUrl && !previewFailed ? (
                  <img
                    src={avatarUrl}
                    alt="Fighter avatar preview"
                    className="h-full w-full object-cover"
                    onError={() => setPreviewFailed(true)}
                  />
                ) : (
                  <span className="text-2xl font-extrabold text-zinc-100">
                    {initials}
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/10">
                  <ImagePlus className="h-3.5 w-3.5" aria-hidden />
                  Upload Image
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => void onUpload(e)}
                  />
                </label>

                {avatarUrl && (
                  <button
                    type="button"
                    onClick={removeAvatar}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-400 transition hover:border-red-400/40 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Remove / Reset
                  </button>
                )}

                <div className="flex items-center gap-1.5">
                  <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-xl border border-white/10 bg-black/50 px-2.5 py-2 focus-within:border-red-500/60">
                    <Link className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
                    <input
                      type="url"
                      value={urlInput}
                      placeholder="Or paste image / NFT URL"
                      onChange={(e) => setUrlInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          applyUrl();
                        }
                      }}
                      className="w-full min-w-0 bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-600"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={applyUrl}
                    className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/10"
                  >
                    Set
                  </button>
                </div>

                <p className="text-[10px] leading-snug text-zinc-600">
                  PNG / JPEG / WebP / GIF up to 8 MB — resized to 160×160.
                  Supports direct links and ipfs:// URIs.
                </p>
              </div>
            </div>

            {/* Fighter class */}
            <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Fighter Class
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {FIGHTER_CLASSES.map((cls) => {
                const meta = FIGHTER_CLASS_META[cls];
                const selected = fighterClass === cls;
                return (
                  <button
                    key={cls}
                    type="button"
                    onClick={() => setFighterClass(cls)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border px-2 pb-2 pt-1 transition",
                      selected
                        ? "border-red-500/60 bg-red-500/10 shadow-[0_0_16px_rgba(239,68,68,0.3)]"
                        : "border-white/10 bg-black/40 hover:border-white/25",
                    )}
                  >
                     <img
                       src={meta.portrait}
                       alt=""
                       aria-hidden
                       draggable={false}
                       className="fighter-portrait"
                       style={{ height: 88, width: "auto" }}
                     />
                    <span
                      className="text-[10px] font-extrabold uppercase tracking-wider"
                      style={{ color: selected ? meta.secondary : "#a1a1aa" }}
                    >
                      {meta.profileLabel ?? meta.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[10px] text-zinc-600">
              {FIGHTER_CLASS_META[fighterClass].blurb}
            </p>

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

            <button
              type="button"
              onClick={save}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-orange-600 py-3 text-sm font-extrabold tracking-wide text-white shadow-[0_0_24px_rgba(239,68,68,0.4)] transition hover:from-red-500 hover:via-rose-500 hover:to-orange-500"
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
