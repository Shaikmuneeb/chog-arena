// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title Chog Arena — 1v1 Deathmatch with Second Wind
/// @notice Two players stake equal MON amounts; a pseudo-random roll settles the
/// duel instantly. A losing Chog NFT holder has a 20% chance of Second Wind —
/// a resurrection that forces a sudden-death re-roll. Protocol rakes 2% of the
/// pot unless either fighter holds a Chog NFT (0% fee perk).
contract ChogArena is Ownable2Step, ReentrancyGuard {
    address public immutable chogNFT;
    address public treasury;

    uint256 public constant PROTOCOL_FEE_BPS = 200; // 2% rake
    uint256 public constant SECOND_WIND_PROB_BPS = 2000; // 20% resurrect chance

    uint256 public duelCounter;

    /// @dev Monotonic nonce mixed into every randomness roll so consecutive
    /// rolls inside one transaction never collide.
    uint256 public rollNonce;

    struct Duel {
        address creator;
        address challenger;
        uint256 betAmount;
        address winner;
        bool resolved;
        bool secondWindProc;
    }

    mapping(uint256 => Duel) public duels;

    event DuelCreated(uint256 indexed duelId, address indexed creator, uint256 betAmount);
    event DuelCancelled(uint256 indexed duelId, address indexed creator);
    event SecondWindTriggered(uint256 indexed duelId, address indexed resurrectedPlayer);
    event DuelResolved(uint256 indexed duelId, address indexed winner, uint256 payout, bool secondWindUsed);

    constructor(address _chogNFT, address _treasury) Ownable(msg.sender) {
        require(_chogNFT != address(0) && _treasury != address(0), "Zero address");
        chogNFT = _chogNFT;
        treasury = _treasury;
    }

    /// @notice Open a duel by staking the bet amount. Active until joined.
    function createDuel() external payable nonReentrant returns (uint256 duelId) {
        require(msg.value > 0, "Bet required");
        duelId = ++duelCounter;
        duels[duelId] = Duel({
            creator: msg.sender,
            challenger: address(0),
            betAmount: msg.value,
            winner: address(0),
            resolved: false,
            secondWindProc: false
        });
        emit DuelCreated(duelId, msg.sender, msg.value);
    }

    /// @notice Back out of an unjoined duel and reclaim your stake.
    function cancelDuel(uint256 duelId) external nonReentrant {
        Duel storage duel = duels[duelId];
        require(duel.creator != address(0), "Duel does not exist");
        require(msg.sender == duel.creator, "Not creator");
        require(duel.challenger == address(0), "Already joined");
        require(!duel.resolved, "Already resolved");

        duel.resolved = true;
        emit DuelCancelled(duelId, msg.sender);

        (bool refunded,) = payable(msg.sender).call{value: duel.betAmount}("");
        require(refunded, "Refund failed");
    }

    /// @notice Accept an open duel with a matching stake and settle it instantly.
    function joinDuel(uint256 duelId) external payable nonReentrant {
        Duel storage duel = duels[duelId];
        require(duel.creator != address(0), "Duel does not exist");
        require(duel.challenger == address(0), "Already joined");
        require(!duel.resolved, "Already resolved");
        require(msg.value == duel.betAmount, "Bet mismatch");
        require(msg.sender != duel.creator, "Cannot fight yourself");

        duel.challenger = msg.sender;

        // Initial outcome roll: 0 -> creator wins, 1 -> challenger wins.
        address winner;
        address loser;
        if (_roll(msg.sender) % 2 == 0) {
            winner = duel.creator;
            loser = msg.sender;
        } else {
            winner = msg.sender;
            loser = duel.creator;
        }

        // Second Wind: a losing Chog NFT holder may resurrect once.
        bool secondWindUsed = false;
        if (IERC721(chogNFT).balanceOf(loser) >= 1) {
            if (_roll(msg.sender) % 10000 < SECOND_WIND_PROB_BPS) {
                duel.secondWindProc = true;
                secondWindUsed = true;
                emit SecondWindTriggered(duelId, loser);

                // Sudden-death re-roll decides the final winner.
                if (_roll(msg.sender) % 2 == 0) {
                    winner = duel.creator;
                } else {
                    winner = msg.sender;
                }
            }
        }

        duel.winner = winner;
        duel.resolved = true;

        // Fee perk: 0% rake when either fighter holds a Chog NFT, else 2%.
        uint256 pot = duel.betAmount * 2;
        uint256 fee = 0;
        if (IERC721(chogNFT).balanceOf(duel.creator) == 0 && IERC721(chogNFT).balanceOf(duel.challenger) == 0) {
            fee = (pot * PROTOCOL_FEE_BPS) / 10000;
        }
        uint256 payout = pot - fee;

        if (fee > 0) {
            (bool feeSent,) = payable(treasury).call{value: fee}("");
            require(feeSent, "Fee transfer failed");
        }
        (bool paid,) = payable(winner).call{value: payout}("");
        require(paid, "Payout failed");

        emit DuelResolved(duelId, winner, payout, secondWindUsed);
    }

    /// @notice Owner rescue: rotate the treasury fee recipient.
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Zero address");
        treasury = _treasury;
    }

    /// @dev Pseudo-random roll salted with a monotonic nonce. NOT
    /// production-secure randomness — prevrandao is miner-influencable.
    function _roll(address player) internal returns (uint256) {
        rollNonce += 1;
        return uint256(keccak256(abi.encodePacked(block.prevrandao, block.timestamp, rollNonce, player)));
    }
}
