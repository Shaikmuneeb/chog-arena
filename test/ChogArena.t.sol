// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ChogArena} from "../src/ChogArena.sol";

/// @dev Minimal Chog NFT stand-in: IERC721.balanceOf(address) selector compatible.
contract MockChogNFT {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function burn(address to, uint256 amount) external {
        balanceOf[to] -= amount;
    }
}

contract ChogArenaTest is Test {
    event DuelCreated(uint256 indexed duelId, address indexed creator, uint256 betAmount);
    event DuelCancelled(uint256 indexed duelId, address indexed creator);
    event SecondWindTriggered(uint256 indexed duelId, address indexed resurrectedPlayer);
    event DuelResolved(uint256 indexed duelId, address indexed winner, uint256 payout, bool secondWindUsed);

    ChogArena internal arena;
    MockChogNFT internal nft;

    address internal treasury = makeAddr("treasury");
    address internal creator = makeAddr("creator");
    address internal challenger = makeAddr("challenger");
    address internal spectator = makeAddr("spectator");

    uint256 internal constant BET = 1 ether;

    /// @dev Safety net so the test contract can receive refunds/payouts when it
    /// is (accidentally or deliberately) a duel participant.
    receive() external payable {}

    function setUp() public {
        nft = new MockChogNFT();
        arena = new ChogArena(address(nft), treasury);
        vm.deal(creator, 100 ether);
        vm.deal(challenger, 100 ether);
    }

    // ---------------------------------------------------------------- helpers

    /// @dev Mirrors ChogArena._roll() so tests can predict outcomes.
    function _predictRoll(uint256 nonce, address player) internal view returns (uint256) {
        return uint256(keccak256(abi.encodePacked(block.prevrandao, block.timestamp, nonce, player)));
    }

    /// @dev Destructures the public duels() getter.
    function _duel(uint256 duelId)
        internal
        view
        returns (
            address creator_,
            address challenger_,
            uint256 betAmount_,
            address winner_,
            bool resolved_,
            bool secondWindProc_
        )
    {
        return arena.duels(duelId);
    }

    // ------------------------------------------------------- create / cancel

    function test_CreateDuel() public {
        vm.expectEmit(true, true, false, true);
        emit DuelCreated(1, creator, BET);

        vm.prank(creator);
        uint256 duelId = arena.createDuel{value: BET}();

        assertEq(duelId, 1);
        (
            address creator_,
            address challenger_,
            uint256 betAmount_,
            address winner_,
            bool resolved_,
            bool secondWindProc_
        ) = _duel(duelId);
        assertEq(creator_, creator);
        assertEq(challenger_, address(0));
        assertEq(betAmount_, BET);
        assertEq(winner_, address(0));
        assertFalse(resolved_);
        assertFalse(secondWindProc_);
        assertEq(address(arena).balance, BET);
    }

    function test_CreateDuel_RevertsWithoutBet() public {
        vm.expectRevert("Bet required");
        arena.createDuel{value: 0}();
    }

    function test_CreateDuel_MultipleDuelsGetIncrementalIds() public {
        vm.prank(challenger);
        uint256 id1 = arena.createDuel{value: BET}();
        uint256 id2 = arena.createDuel{value: 2 ether}();
        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(arena.duelCounter(), 2);
    }

    function test_CancelDuel() public {
        vm.prank(creator);
        arena.createDuel{value: BET}();

        uint256 balanceBefore = creator.balance;

        vm.expectEmit(true, true, false, true);
        emit DuelCancelled(1, creator);
        vm.prank(creator);
        arena.cancelDuel(1);

        assertEq(creator.balance, balanceBefore + BET);
        assertEq(address(arena).balance, 0);
        (,,,, bool resolved_,) = _duel(1);
        assertTrue(resolved_);
    }

    function test_CancelDuel_RevertsForNonCreator() public {
        arena.createDuel{value: BET}();
        vm.prank(spectator);
        vm.expectRevert("Not creator");
        arena.cancelDuel(1);
    }

    function test_CancelDuel_RevertsAfterJoin() public {
        vm.prank(creator);
        arena.createDuel{value: BET}();
        vm.prank(challenger);
        arena.joinDuel{value: BET}(1);

        vm.prank(creator);
        vm.expectRevert("Already joined");
        arena.cancelDuel(1);
    }

    function test_CancelDuel_RevertsForUnknownDuel() public {
        vm.prank(creator);
        vm.expectRevert("Duel does not exist");
        arena.cancelDuel(42);
    }

    // -------------------------------------------------------------- settlement

    function test_SettleDuel_NonNftHolders_Pays2PctFee() public {
        vm.prevrandao(bytes32(uint256(42)));
        vm.warp(1_000_000);

        bool creatorWins = _predictRoll(1, challenger) % 2 == 0;
        address expectedWinner = creatorWins ? creator : challenger;

        vm.prank(creator);
        arena.createDuel{value: BET}();

        vm.prank(challenger);
        arena.joinDuel{value: BET}(1);

        uint256 pot = BET * 2;
        uint256 expectedFee = (pot * 200) / 10000; // 0.04 ether
        uint256 expectedPayout = pot - expectedFee;

        (,,, address winner_, bool resolved_, bool secondWindProc_) = _duel(1);
        assertEq(winner_, expectedWinner);
        assertTrue(resolved_);
        assertFalse(secondWindProc_);

        assertEq(treasury.balance, expectedFee);
        assertEq(expectedWinner.balance, 99 ether + expectedPayout);
        assertEq(address(arena).balance, 0);
    }

    function test_SettleDuel_NftHolder_FeeWaived() public {
        vm.prevrandao(bytes32(uint256(7)));
        vm.warp(1_000_000);

        // Creator holds a Chog NFT -> 0% rake even though challenger has none.
        nft.mint(creator, 1);

        bool creatorWins = _predictRoll(1, challenger) % 2 == 0;
        address expectedWinner = creatorWins ? creator : challenger;

        vm.prank(creator);
        arena.createDuel{value: BET}();

        vm.prank(challenger);
        arena.joinDuel{value: BET}(1);

        (,,, address winner_, bool resolved_,) = _duel(1);
        assertEq(winner_, expectedWinner);
        assertTrue(resolved_);

        assertEq(treasury.balance, 0);
        assertEq(expectedWinner.balance, 99 ether + BET * 2);
    }

    function test_JoinDuel_RevertsOnBetMismatch() public {
        arena.createDuel{value: BET}();
        vm.prank(challenger);
        vm.expectRevert("Bet mismatch");
        arena.joinDuel{value: BET - 1}(1);
    }

    function test_JoinDuel_RevertsOnSelfDuel() public {
        vm.prank(creator);
        arena.createDuel{value: BET}();
        vm.prank(creator);
        vm.expectRevert("Cannot fight yourself");
        arena.joinDuel{value: BET}(1);
    }

    function test_JoinDuel_RevertsWhenAlreadyJoined() public {
        vm.prank(creator);
        arena.createDuel{value: BET}();
        vm.prank(challenger);
        arena.joinDuel{value: BET}(1);

        vm.deal(spectator, 1 ether);
        vm.prank(spectator);
        vm.expectRevert("Already joined");
        arena.joinDuel{value: BET}(1);
    }

    // ------------------------------------------------------------ second wind

    function test_SecondWind_ResurrectsLoser() public {
        vm.warp(1_000_000);

        // Both fighters hold Chog NFTs so the initial loser is always eligible
        // for Second Wind (and the fee perk applies).
        nft.mint(creator, 1);
        nft.mint(challenger, 1);

        vm.prank(creator);
        arena.createDuel{value: BET}();

        // Brute-force a prevrandao seed where the Second Wind roll (nonce 2)
        // lands under the 20% threshold.
        uint256 seed;
        bool found;
        for (uint256 s = 1; s < 500; s++) {
            vm.prevrandao(bytes32(s));
            if (_predictRoll(2, challenger) % 10000 < 2000) {
                seed = s;
                found = true;
                break;
            }
        }
        assertTrue(found, "no seed triggered Second Wind");
        vm.prevrandao(bytes32(seed));

        // Predict the combatants from the combat roll (nonce 1) and the final
        // winner from the sudden-death re-roll (nonce 3).
        address initialLoser = _predictRoll(1, challenger) % 2 == 0 ? challenger : creator;
        address expectedWinner = _predictRoll(3, challenger) % 2 == 0 ? creator : challenger;

        vm.expectEmit(true, true, false, true, address(arena));
        emit SecondWindTriggered(1, initialLoser);
        vm.expectEmit(true, true, false, true, address(arena));
        // Fee perk: both hold NFTs -> winner takes the whole 2 ether pot.
        emit DuelResolved(1, expectedWinner, BET * 2, true);

        vm.prank(challenger);
        arena.joinDuel{value: BET}(1);

        (,,, address winner_, bool resolved_, bool secondWindProc_) = _duel(1);
        assertTrue(secondWindProc_, "secondWindProc not set");
        assertTrue(resolved_);
        assertEq(winner_, expectedWinner);
        // Winner paid the 1 ETH stake and takes the whole 2 ETH pot back.
        assertEq(expectedWinner.balance, 99 ether + BET * 2);
        assertEq(treasury.balance, 0);
    }

    function test_SecondWind_NotTriggeredForNonNftLoser() public {
        vm.prevrandao(bytes32(uint256(99)));
        vm.warp(1_000_000);

        // Only the creator holds an NFT; if the challenger loses there is no
        // Second Wind check at all — settle with the regular outcome.
        nft.mint(creator, 1);
        vm.prank(creator);
        arena.createDuel{value: BET}();

        // Find a seed where the loser is the NFT-less challenger (roll 1 == 0
        // means creator wins) so the Second Wind path must be skipped.
        uint256 seed;
        bool found;
        for (uint256 s = 1; s < 500; s++) {
            vm.prevrandao(bytes32(s));
            if (_predictRoll(1, challenger) % 2 == 0) {
                seed = s;
                found = true;
                break;
            }
        }
        assertTrue(found);
        vm.prevrandao(bytes32(seed));

        vm.prank(challenger);
        arena.joinDuel{value: BET}(1);

        (,,, address winner_, bool resolved_, bool secondWindProc_) = _duel(1);
        assertEq(winner_, creator);
        assertTrue(resolved_);
        assertFalse(secondWindProc_);
    }

    // ------------------------------------------------------------------ owner

    function test_SetTreasury_OnlyOwner() public {
        address newTreasury = makeAddr("newTreasury");
        vm.prank(creator);
        vm.expectRevert();
        arena.setTreasury(newTreasury);

        arena.setTreasury(newTreasury);
        assertEq(arena.treasury(), newTreasury);
    }

    // -------------------------------------------------------- arena funding

    function test_Receive_AcceptsPlainEth() public {
        vm.deal(spectator, 1 ether);
        (bool ok,) = address(arena).call{value: 0.4 ether}("");
        assertTrue(ok);
        assertEq(address(arena).balance, 0.4 ether);
    }

    function test_FundArena_AccumulatesBankroll() public {
        vm.deal(spectator, 5 ether);
        vm.prank(spectator);
        arena.fundArena{value: 2 ether}();
        assertEq(address(arena).balance, 2 ether);

        vm.prank(spectator);
        arena.fundArena{value: 1 ether}();
        assertEq(address(arena).balance, 3 ether);
    }

    // -------------------------------------------------------------- fightNpc

    function test_FightNpc_RevertsWithoutStake() public {
        vm.prank(challenger);
        vm.expectRevert("Stake required");
        arena.fightNpc{value: 0}(1);
    }

    function test_SettleDuel_PlaceholderNftAddress_DoesNotRevert() public {
        // Deploy with a precompile-style placeholder NFT address (no code):
        // raw IERC721.balanceOf would revert on empty return data.
        ChogArena bare = new ChogArena(address(0x01), treasury);
        vm.deal(creator, 10 ether);
        vm.deal(challenger, 10 ether);

        vm.prank(creator);
        bare.createDuel{value: BET}();
        vm.prank(challenger);
        bare.joinDuel{value: BET}(1);

        (,,, address winner_, bool resolved_,) = bare.duels(1);
        assertTrue(resolved_);
        assertTrue(winner_ == creator || winner_ == challenger);
        // No NFT perk without a real NFT contract -> 2% rake applies.
        assertEq(treasury.balance, (BET * 2 * 200) / 10000);
    }

    function test_FightNpc_PlaceholderNftAddress_DoesNotRevert() public {
        ChogArena bare = new ChogArena(address(0x01), treasury);
        vm.deal(challenger, 10 ether);
        vm.deal(spectator, 10 ether);
        vm.prank(spectator);
        bare.fundArena{value: 5 ether}();

        // A raw IERC721.balanceOf against the placeholder would revert here.
        vm.prank(challenger);
        bare.fightNpc{value: BET}(1);
        assertEq(bare.duelCounter(), 1);
    }

    function test_FightNpc_IncrementsDuelCounter() public {
        vm.deal(challenger, 10 ether);
        vm.prank(challenger);
        arena.fightNpc{value: 1 ether}(1);
        assertEq(arena.duelCounter(), 1);
    }

    function test_FightNpc_PlayerWins_PaysFromBankroll_WithFee() public {
        vm.warp(1_000_000);
        vm.deal(challenger, 10 ether);
        // Top up the house bankroll so a win can be paid out.
        vm.deal(spectator, 10 ether);
        vm.prank(spectator);
        arena.fundArena{value: 5 ether}();

        // Non-holder: first roll (nonce 1) % 2 == 0 means player wins.
        bool playerWins;
        for (uint256 s = 1; s < 500; s++) {
            vm.prevrandao(bytes32(s));
            if (_predictRoll(1, challenger) % 2 == 0) {
                playerWins = true;
                break;
            }
        }
        assertTrue(playerWins, "seed must give the player a win");

        uint256 pot = BET * 2;
        uint256 expectedFee = (pot * 200) / 10000; // 0.04 ether
        uint256 expectedPayout = pot - expectedFee;

        vm.expectEmit(true, true, false, true, address(arena));
        emit DuelResolved(1, challenger, expectedPayout, false);

        vm.prank(challenger);
        (bool playerWon, bool secondWindUsed, uint256 payout) = arena.fightNpc{value: BET}(1);

        assertTrue(playerWon);
        assertFalse(secondWindUsed);
        assertEq(payout, expectedPayout);
        assertEq(challenger.balance, 9 ether + expectedPayout);
        assertEq(treasury.balance, expectedFee);
        // Bankroll: 5 + 1 stake - payout - fee = 5.96
        assertEq(address(arena).balance, 5 ether + BET - expectedPayout - expectedFee);
    }

    function test_FightNpc_NpcWins_KeepsStakeAndRakes() public {
        vm.prevrandao(bytes32(uint256(7)));
        vm.warp(1_000_000);
        vm.deal(challenger, 10 ether);

        // Find a seed where the NPC wins (nonce 1 roll != 0).
        uint256 seed;
        bool found;
        for (uint256 s = 1; s < 500; s++) {
            vm.prevrandao(bytes32(s));
            if (_predictRoll(1, challenger) % 2 != 0) {
                seed = s;
                found = true;
                break;
            }
        }
        assertTrue(found);
        vm.prevrandao(bytes32(seed));

        uint256 expectedFee = (BET * 200) / 10000; // 2% of the stake

        vm.prank(challenger);
        (bool playerWon, bool secondWindUsed, uint256 payout) = arena.fightNpc{value: BET}(1);

        assertFalse(playerWon);
        assertFalse(secondWindUsed);
        assertEq(payout, 0);
        assertEq(challenger.balance, 9 ether);
        assertEq(treasury.balance, expectedFee);
        assertEq(address(arena).balance, BET - expectedFee);
    }

    function test_FightNpc_NftHolder_SecondWindClutch_FeeWaived() public {
        vm.warp(1_000_000);
        nft.mint(challenger, 1);
        vm.deal(challenger, 10 ether);
        vm.deal(spectator, 10 ether);
        vm.prank(spectator);
        arena.fundArena{value: 5 ether}();

        // Find one seed where: initial roll (nonce 1) loses, Second Wind
        // (nonce 2) lands under 20%, and sudden death (nonce 3) goes to the
        // player — a full clutch comeback in a single pass.
        bool found;
        for (uint256 s = 1; s < 5000; s++) {
            vm.prevrandao(bytes32(s));
            if (
                _predictRoll(1, challenger) % 2 != 0 && _predictRoll(2, challenger) % 10000 < 2000
                    && _predictRoll(3, challenger) % 2 == 0
            ) {
                found = true;
                break;
            }
        }
        assertTrue(found, "no seed triggered the clutch comeback");

        vm.expectEmit(true, true, false, true, address(arena));
        emit SecondWindTriggered(1, challenger);
        // NFT holder -> 0% rake; winner takes the full 2 ether pot.
        vm.expectEmit(true, true, false, true, address(arena));
        emit DuelResolved(1, challenger, BET * 2, true);

        vm.prank(challenger);
        (bool playerWon, bool secondWindUsed, uint256 payout) = arena.fightNpc{value: BET}(1);

        assertTrue(playerWon, "clutch comeback must win");
        assertTrue(secondWindUsed);
        assertEq(payout, BET * 2);
        assertEq(challenger.balance, 9 ether + BET * 2);
        assertEq(treasury.balance, 0);
    }

    function test_FightNpc_UnderfundedBankroll_CapsPayoutNoRevert() public {
        vm.warp(1_000_000);
        vm.deal(challenger, 10 ether);

        // Empty house pool: arena balance == the incoming stake only.
        bool playerWins;
        for (uint256 s = 1; s < 500; s++) {
            vm.prevrandao(bytes32(s));
            if (_predictRoll(1, challenger) % 2 == 0) {
                playerWins = true;
                break;
            }
        }
        assertTrue(playerWins, "seed must give the player a win");

        vm.prank(challenger);
        (bool playerWon,, uint256 payout) = arena.fightNpc{value: BET}(1);

        assertTrue(playerWon);
        // Capped to the full contract balance (the stake itself); fee skipped.
        assertEq(payout, BET);
        assertEq(challenger.balance, 9 ether + BET);
        assertEq(address(arena).balance, 0);
        assertEq(treasury.balance, 0);
    }

    function test_FightNpc_NftHolderLoss_NoSecondWind_KeepsStakeNoFee() public {
        vm.warp(1_000_000);
        nft.mint(challenger, 1);
        vm.deal(challenger, 10 ether);

        // Seed: player loses (nonce 1 != 0) and Second Wind fails (nonce 2 >= 2000).
        uint256 seed;
        bool found;
        for (uint256 s = 1; s < 2000; s++) {
            vm.prevrandao(bytes32(s));
            if (_predictRoll(1, challenger) % 2 != 0 && _predictRoll(2, challenger) % 10000 >= 2000) {
                seed = s;
                found = true;
                break;
            }
        }
        assertTrue(found);
        vm.prevrandao(bytes32(seed));

        vm.prank(challenger);
        (bool playerWon, bool secondWindUsed, uint256 payout) = arena.fightNpc{value: BET}(1);

        assertFalse(playerWon);
        assertFalse(secondWindUsed);
        assertEq(payout, 0);
        // Holder perk: no rake on the lost stake.
        assertEq(treasury.balance, 0);
        assertEq(address(arena).balance, BET);
    }
}
