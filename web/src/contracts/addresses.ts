import type { Address } from "viem";

/**
 * Live ChogArena deployment — Monad Mainnet (chain 143).
 * Deployed 2026-10-16 via `forge script script/Deploy.s.sol:Deploy --broadcast`.
 * House bankroll funded with 0.5 MON via fundArena().
 */
export const CHOG_ARENA_ADDRESS =
  "0x46861e04D6F426A2b217c48E123dfF26E1403596" as const satisfies Address;

/**
 * Chog NFT collection — still a placeholder until the real ERC721 is live.
 * ChogArena._holdsChogNft() treats code-less addresses as "no NFTs" via a
 * revert-safe staticcall, so gameplay and fee logic work regardless.
 */
export const CHOG_NFT_ADDRESS =
  "0x1000000000000000000000000000000000000001" as const satisfies Address;
