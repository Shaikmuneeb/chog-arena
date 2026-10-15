import { createConfig, http, injected } from "wagmi";
import { chains } from "./monadChain";
import { monad, monadTestnet } from "./monadChain";

/**
 * Wagmi config for Chog Arena.
 *
 * - `injected()` (generic) + targeted connectors for MetaMask / Rabby /
 *   Backpack so each wallet can be picked explicitly.
 * - `multiInjectedProviderDiscovery: true` turns on EIP-6963, so any wallet
 *   announcing itself through `window`ethereum` (Rabby, Backpack, MetaMask,
 *   Coinbase, etc.) is auto-discovered and appears in `useConnect().connectors`.
 */
export const config = createConfig({
  chains: [monad, monadTestnet],
  connectors: [
    injected(), // generic browser-injected fallback (window.ethereum)
    injected({ target: "metaMask" }),
    injected({ target: "rabby" }),
    injected({ target: "backpack" }),
  ],
  transports: {
    [monad.id]: http(monad.rpcUrls.default.http[0]),
    [monadTestnet.id]: http(monadTestnet.rpcUrls.default.http[0]),
  },
  multiInjectedProviderDiscovery: true,
});

export { chains };
