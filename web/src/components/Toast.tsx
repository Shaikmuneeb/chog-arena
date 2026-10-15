"use client";

import { useSyncExternalStore } from "react";
import { CheckCircle2, Loader2, XCircle, X } from "lucide-react";
import { monad } from "@/config/monadChain";

export type ToastKind = "pending" | "success" | "error";

export type ToastItem = {
  id: number;
  kind: ToastKind;
  message: string;
  txHash?: `0x${string}`;
};

const EMPTY: ToastItem[] = [];
let toasts: ToastItem[] = EMPTY;
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return toasts;
}

function getServerSnapshot() {
  return EMPTY;
}

export function pushToast(input: {
  kind: ToastKind;
  message: string;
  txHash?: `0x${string}`;
}): number {
  const id = nextId++;
  toasts = [...toasts, { ...input, id }];
  emit();
  if (input.kind !== "pending") {
    setTimeout(() => dismissToast(id), 7000);
  }
  return id;
}

export function updateToast(
  id: number,
  patch: { kind: ToastKind; message: string; txHash?: `0x${string}` },
) {
  toasts = toasts.map((t) => (t.id === id ? { ...t, ...patch } : t));
  emit();
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

/** Fixed-position toast host — mount once inside Providers. */
export function Toaster() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-white/10 bg-zinc-900 p-3 shadow-2xl shadow-black/50"
        >
          {t.kind === "pending" && (
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-zinc-400" />
          )}
          {t.kind === "success" && (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          )}
          {t.kind === "error" && (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm text-zinc-200">{t.message}</p>
            {t.txHash && (
              <a
                href={`${monad.blockExplorers.default.url}/tx/${t.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="mt-0.5 block truncate font-mono text-xs text-purple-300 hover:text-purple-200"
              >
                {t.txHash.slice(0, 10)}…{t.txHash.slice(-8)}
              </a>
            )}
          </div>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            className="shrink-0 text-zinc-500 transition hover:text-zinc-300"
            aria-label="Dismiss notification"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
