import { createConfig, http, injected } from "wagmi";
import { chains } from "./monadChain";
import { monad, monadTestnet } from "./monadChain";

/**
 * Wagmi config for Chog Arena.
 *
 * Injected connectors only — each target resolves to the wallet's injected
 * provider (window.backpack / window.rabby / window.ethereum) and reports
 * itself as unavailable when the extension isn't installed.
 */
export const config = createConfig({
  chains: [monad, monadTestnet],
  connectors: [
    injected({ target: "backpack" }),
    injected({ target: "rabby" }),
    injected({ target: "metaMask" }),
  ],
  transports: {
    [monad.id]: http(monad.rpcUrls.default.http[0]),
    [monadTestnet.id]: http(monadTestnet.rpcUrls.default.http[0]),
  },
  multiInjectedProviderDiscovery: false,
});

export { chains };
