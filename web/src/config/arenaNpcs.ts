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
    key: "crimson-benja",
    npcId: 1,
    address: "0x1111111111111111111111111111111111110001",
    name: "Crimson Lord Benja",
    title: "Crimson Lord",
    fighterClass: "benja",
    wager: parseEther("0.1"),
  },
  {
    key: "chog-samurai",
    npcId: 2,
    address: "0x1111111111111111111111111111111111110002",
    name: "Chog Samurai",
    title: "10,000 TPS Blade",
    fighterClass: "samurai",
    wager: parseEther("0.5"),
  },
  {
    key: "void-lord-james",
    npcId: 3,
    address: "0x1111111111111111111111111111111111110003",
    name: "Void Lord James",
    title: "Abyssal Claw Executioner",
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
