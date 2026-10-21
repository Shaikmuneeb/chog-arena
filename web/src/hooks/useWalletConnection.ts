"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ConnectorAlreadyConnectedError,
  ConnectorNotFoundError,
  useAccount,
  useConnect,
  useConnectors,
  useDisconnect,
  useReconnect,
} from "wagmi";
import { UserRejectedRequestError } from "viem";
import { monad, monadTestnet } from "@/config/monadChain";

/**
 * Wallet connection state machine.
 *
 * Everything about a wallet connection is asynchronous and can fail in a
 * dozen ways, so the state lives here instead of in the component:
 *
 *  - a click is never left hanging: every attempt is bounded by
 *    CONNECT_TIMEOUT_MS and always resolves to a status the UI can show
 *  - a rejected, missing or unresponsive wallet produces a readable
 *    message instead of a silent no-op
 *  - a returning visitor is reconnected automatically: wagmi's own
 *    reconnect-on-mount is tried first, then every announced provider is
 *    polled for an existing authorisation, so the modal never opens on an
 *    empty list when the wallet is already authorised
 *  - the connector list is derived on the client only, so the EIP-6963
 *    providers that only exist in the browser never trip a hydration
 *    mismatch
 */

/** How long a wallet prompt may stay open before we stop waiting on it. */
const CONNECT_TIMEOUT_MS = 20_000;

export type WalletStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "error"
  | "missing";

export type WalletOption = {
  /** the connector uid */
  id: string;
  name: string;
  /** the two letters drawn in the tile */
  monogram: string;
  /** tailwind gradient for the tile */
  gradient: string;
  status: WalletStatus;
  /** the human readable status / error line */
  message?: string;
  /** true when the wallet is actually present in this browser */
  installed: boolean;
};

/** Known wallets, keyed by their EIP-6963 rdns. */
const KNOWN_WALLETS: Record<
  string,
  { name: string; monogram: string; gradient: string }
> = {
  "io.metamask": {
    name: "MetaMask",
    monogram: "MM",
    gradient: "from-orange-400 to-rose-600",
  },
  "io.rabby": {
    name: "Rabby",
    monogram: "R",
    gradient: "from-blue-500 to-emerald-400",
  },
  "com.backpack": {
    name: "Backpack",
    monogram: "B",
    gradient: "from-slate-300 to-blue-500",
  },
  "com.coinbase.wallet": {
    name: "Coinbase Wallet",
    monogram: "CB",
    gradient: "from-blue-400 to-blue-700",
  },
  "app.phantom": {
    name: "Phantom",
    monogram: "P",
    gradient: "from-violet-500 to-fuchsia-600",
  },
  "com.brave.wallet": {
    name: "Brave Wallet",
    monogram: "BR",
    gradient: "from-amber-500 to-orange-700",
  },
  "com.trustwallet.app": {
    name: "Trust Wallet",
    monogram: "T",
    gradient: "from-sky-400 to-blue-600",
  },
  "com.walletconnect": {
    name: "WalletConnect",
    monogram: "W",
    gradient: "from-blue-500 to-indigo-600",
  },
  "com.okex.wallet": {
    name: "OKX Wallet",
    monogram: "OK",
    gradient: "from-zinc-200 to-zinc-500",
  },
  "com.tokenpocket.pro": {
    name: "TokenPocket",
    monogram: "TP",
    gradient: "from-emerald-400 to-teal-600",
  },
  "io.rabbywallet": {
    name: "Rabby",
    monogram: "R",
    gradient: "from-blue-500 to-emerald-400",
  },
};

/** Fallback identity for a wallet we do not have a brand for. */
function genericWallet(name: string) {
  const clean = name.replace(/^Injected\s*/i, "").trim() || "Browser Wallet";
  return {
    name: clean,
    monogram: clean.slice(0, 2).toUpperCase(),
    gradient: "from-zinc-500 to-zinc-700",
  };
}

/** The rdns list of a connector (it may be a single id or an array). */
function rdnsList(connector: {
  rdns?: string | readonly string[];
}): string[] {
  const rdns = connector.rdns;
  if (!rdns) return [];
  return typeof rdns === "string" ? [rdns] : [...(rdns as readonly string[])];
}

/** Resolve a connector to a known wallet. */
function identify(connector: {
  name: string;
  rdns?: string | readonly string[];
}): { name: string; monogram: string; gradient: string } {
  for (const id of rdnsList(connector)) {
    const hit = KNOWN_WALLETS[id.toLowerCase()];
    if (hit) return hit;
  }
  const name = connector.name.toLowerCase();
  for (const [id, wallet] of Object.entries(KNOWN_WALLETS)) {
    if (name.includes(wallet.name.toLowerCase())) return wallet;
    if (id.includes(name)) return wallet;
  }
  return genericWallet(connector.name);
}

/** True when the browser actually has a wallet to talk to. */
function walletInstalled(connector: { rdns?: string | readonly string[] }): boolean {
  /* an EIP-6963 provider announced itself, so it is installed */
  if (connector.rdns) return true;
  if (typeof window === "undefined") return false;
  return Boolean((window as Window & { ethereum?: unknown }).ethereum);
}

/** Turn any connector failure into something a human can act on. */
export function describeConnectError(error: unknown): string {
  if (error instanceof UserRejectedRequestError) {
    return "Request rejected in your wallet";
  }
  if (error instanceof ConnectorNotFoundError) {
    return "No wallet found in this browser";
  }
  if (error instanceof ConnectorAlreadyConnectedError) {
    return "Already connected";
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/timeout|timed out/i.test(message)) {
    return "Timed out - open your wallet and try again";
  }
  if (/reject|denied|declin/i.test(message)) {
    return "Request rejected in your wallet";
  }
  if (/not (installed|found|available)|unavailable|unauthorized/i.test(message)) {
    return "Wallet unavailable - install it and try again";
  }
  if (/chain|network/i.test(message)) {
    return "Switch to Monad in your wallet, then retry";
  }
  return message.slice(0, 90) || "Could not connect";
}

/** Race a promise against a clock so a dead wallet can never hang the UI. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("connection timeout")),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export type AutoReconnectState = "idle" | "scanning" | "connected" | "done";

export function useWalletConnection() {
  const connectors = useConnectors();
  const { connectAsync } = useConnect();
  const { disconnect } = useDisconnect();
  const { reconnectAsync } = useReconnect();
  const { address, chainId, isConnected, connector: active } = useAccount();

  const [mounted, setMounted] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [auto, setAuto] = useState<AutoReconnectState>("idle");

  /* a token so a stale connection attempt can never clobber a newer one */
  const attemptRef = useRef(0);
  const autoRanRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  /* ---- auto-reconnect fallback -------------------------------------
   * wagmi reconnects on mount from storage, but that only covers the
   * connector it stored. If a visitor has authorised the site in another
   * wallet, every announced provider is polled for an existing
   * authorisation and connected silently. */
  useEffect(() => {
    if (!mounted || isConnected || autoRanRef.current) return;
    autoRanRef.current = true;
    let cancelled = false;
    (async () => {
      setAuto("scanning");
      for (const connector of connectors) {
        if (cancelled) return;
        try {
          const result = await reconnectAsync({ connectors: [connector] });
          if (result.length) {
            if (!cancelled) setAuto("connected");
            return;
          }
        } catch {
          /* this provider is not authorised - try the next one */
        }
      }
      if (!cancelled) setAuto("done");
    })();
    return () => {
      cancelled = true;
    };
  }, [mounted, isConnected, connectors, reconnectAsync]);

  /* ---- the wallet list --------------------------------------------- */
  const options = useMemo<WalletOption[]>(() => {
    if (!mounted) return [];
    const seen = new Set<string>();
    const list: WalletOption[] = [];
    for (const connector of connectors) {
      const rdns = rdnsList(connector);
      const key = (rdns[0] ?? connector.name).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const identity = identify(connector);
      const installed = walletInstalled(connector);
      list.push({
        id: connector.uid,
        name: identity.name,
        monogram: identity.monogram,
        gradient: identity.gradient,
        installed,
        status: "idle",
      });
    }
    /* the generic "Injected" connector is the same provider as whichever
     * wallet announced itself - drop it so the list has no duplicates */
    const named = list.filter((w) => w.name !== "Browser Wallet");
    return named.length ? named : list;
  }, [connectors, mounted]);

  /* ---- connect ------------------------------------------------------ */
  const connectWallet = useCallback(
    async (id: string) => {
      const connector = connectors.find((c) => c.uid === id);
      if (!connector) return;
      const token = ++attemptRef.current;
      setPendingId(id);
      setErrors((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      try {
        await withTimeout(
          connectAsync({
            connector,
            chainId: chainId === monadTestnet.id ? monadTestnet.id : monad.id,
          }),
          CONNECT_TIMEOUT_MS,
        );
        if (token === attemptRef.current) setPendingId(null);
      } catch (error) {
        if (token !== attemptRef.current) return;
        setPendingId(null);
        setErrors((prev) => ({ ...prev, [id]: describeConnectError(error) }));
      }
    },
    [connectors, connectAsync, chainId],
  );

  /* ---- give up on a stuck prompt ------------------------------------ */
  const cancel = useCallback(() => {
    attemptRef.current += 1;
    setPendingId(null);
  }, []);

  const disconnectWallet = useCallback(() => {
    cancel();
    disconnect();
  }, [cancel, disconnect]);

  /* ---- merge the live state into the list --------------------------- */
  const rows = useMemo<WalletOption[]>(
    () =>
      options.map((option) => {
        if (pendingId === option.id) {
          return {
            ...option,
            status: "connecting" as const,
            message: "Confirm in your wallet...",
          };
        }
        const error = errors[option.id];
        if (error) {
          return { ...option, status: "error" as const, message: error };
        }
        if (isConnected && active?.uid === option.id) {
          return {
            ...option,
            status: "connected" as const,
            message: "Connected",
          };
        }
        if (!option.installed) {
          return {
            ...option,
            status: "missing" as const,
            message: "Not installed",
          };
        }
        return option;
      }),
    [options, pendingId, errors, isConnected, active],
  );

  return {
    /** false until the client has mounted - keep server markup stable */
    mounted,
    /** the wallet list, already carrying the live status of each row */
    wallets: rows,
    /** the wallet that is currently connected */
    active,
    address,
    chainId,
    isConnected,
    /** true while a connection attempt is in flight */
    isConnecting: pendingId !== null,
    /** the id of the wallet being connected */
    pendingId,
    /** where the auto-reconnect scan got to */
    auto,
    connectWallet,
    cancel,
    disconnectWallet,
  };
}
