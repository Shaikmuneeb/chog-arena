import type { Address } from "viem";

/**
 * DUMMY placeholder addresses — replace with the real addresses printed by
 * `forge script script/Deploy.s.sol:Deploy --rpc-url monad_mainnet --broadcast`
 * (and the deployed Chog NFT) once the arena contracts are live on Monad.
 */
export const CHOG_NFT_ADDRESS =
  "0x1000000000000000000000000000000000000001" as const satisfies Address;

export const CHOG_SHIELD_ADDRESS =
  "0x2000000000000000000000000000000000000002" as const satisfies Address;

export const PREDICTION_MARKET_ADDRESS =
  "0x3000000000000000000000000000000000000003" as const satisfies Address;
