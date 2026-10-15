import { defineChain } from "viem";

/** Monad Mainnet — chain id 143 */
export const monad = defineChain({
  id: 143,
  name: "Monad Mainnet",
  nativeCurrency: {
    name: "Monad",
    symbol: "MON",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.monad.xyz"],
    },
  },
  blockExplorers: {
    default: {
      name: "Monad Explorer",
      url: "https://explorer.monad.xyz",
    },
  },
  testnet: false,
});

/** Monad Testnet — chain id 10143 */
export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: {
    name: "Monad",
    symbol: "MON",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://testnet-rpc.monad.xyz"],
    },
  },
  blockExplorers: {
    default: {
      name: "Monad Explorer (testnet)",
      url: "https://testnet.monadexplorer.com",
    },
  },
  testnet: true,
});

export const chains = [monad, monadTestnet] as const;

/**
 * Chain new/incorrect wallets are switched to (Monad Mainnet). Passed to
 * `switchChain` so the wallet shows its Add/Switch Network prompt using the
 * rpcUrls + nativeCurrency (MON, 18 decimals) defined above.
 */
export const targetChain = monad;

/** True when the wallet is already on any Monad network (mainnet or testnet). */
export function isMonadChainId(chainId: number | undefined): boolean {
  return chainId === monad.id || chainId === monadTestnet.id;
}
