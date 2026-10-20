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

/**
 * Arena NPC challengers. Only the two characters that ship a rigged 3D
 * Mixamo model enter the arena, so every duel is a full 3D fight.
 */
export const ARENA_NPCS: ArenaNpc[] = [
  {
    key: "void-lord-james",
    npcId: 3,
    address: "0x1111111111111111111111111111111111110003",
    name: "Void Lord James",
    title: "Abyssal Claw Executioner",
    fighterClass: "void_lord_james",
    wager: parseEther("1"),
  },
  {
    key: "chog-princess",
    npcId: 6,
    address: "0x1111111111111111111111111111111111110006",
    name: "Chog Princess",
    title: "Chog Princess",
    fighterClass: "chog_princess",
    wager: parseEther("1.2"),
  },
];

/** Synthetic duel ids for NPC rows (never clash with on-chain duelCounter). */
export const NPC_DUEL_ID_BASE = 900_000;
