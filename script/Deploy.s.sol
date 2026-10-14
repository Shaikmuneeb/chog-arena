// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {ChogArena} from "../src/ChogArena.sol";

/// @notice Deploys Chog Arena (1v1 Deathmatch with Second Wind) to Monad.
///
/// This script is NOT run automatically — execute it yourself with your own deployer key:
///
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url monad_mainnet \
///     --broadcast
///
/// Required env vars (shell or an untracked .env file):
///   PRIVATE_KEY       - deployer key (also becomes the owner of ChogArena)
///   CHOG_NFT_ADDRESS  - deployed Chog NFT (ERC721) that gates the fee perk / Second Wind
///   TREASURY_ADDRESS  - receives the 2% protocol rake (only when no fighter holds a Chog NFT)
///
/// Never commit a real private key to this repo.
contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address chogNftAddress = vm.envAddress("CHOG_NFT_ADDRESS");
        address treasuryAddress = vm.envAddress("TREASURY_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        ChogArena arena = new ChogArena(chogNftAddress, treasuryAddress);
        console2.log("ChogArena deployed at", address(arena));

        vm.stopBroadcast();

        console2.log("Next steps (manual, NOT part of this script):");
        console2.log("1. Deploy the Chog NFT first if it isn't live yet, then set CHOG_NFT_ADDRESS.");
        console2.log("2. Paste the arena address into your frontend config.");
    }
}
