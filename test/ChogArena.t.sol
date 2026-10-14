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
}
