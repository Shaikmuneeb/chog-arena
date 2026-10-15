import { parseEther } from "viem";
import type { FighterClass } from "./fighterClasses";

export type ArenaNpc = {
  key: string;
  /** On-chain npcId passed to ChogArena.fightNpc(). */
  npcId: number;
  address: `0x${string}`;
  name: string;
  title: string;
  fighterClass: FighterClass;
  wager: bigint;
};

/** Distinct arena NPC challengers available in the demo lobby. */
export const ARENA_NPCS: ArenaNpc[] = [
  {
    key: "liquidation-bot",
    npcId: 1,
    address: "0x1111111111111111111111111111111111110001",
    name: "Liquidation Bot",
    title: "Ruthless Mecha",
    fighterClass: "juggernaut",
    wager: parseEther("0.1"),
  },
  {
    key: "monad-ronin",
    npcId: 2,
    address: "0x1111111111111111111111111111111111110002",
    name: "Monad Ronin",
    title: "10,000 TPS Blade",
    fighterClass: "ronin",
    wager: parseEther("0.5"),
  },
  {
    key: "void-sorcerer",
    npcId: 3,
    address: "0x1111111111111111111111111111111111110003",
    name: "Void Sorcerer",
    title: "Dark Pool Caster",
    fighterClass: "mage",
    wager: parseEther("1"),
  },
  {
    key: "warlord-chogzilla",
    npcId: 4,
    address: "0x1111111111111111111111111111111111110004",
    name: "Warlord Chogzilla",
    title: "Arena Grand Champion",
    fighterClass: "berserker",
    wager: parseEther("2.5"),
  },
];

/** Synthetic duel ids for NPC rows (never clash with on-chain duelCounter). */
export const NPC_DUEL_ID_BASE = 900_000;
