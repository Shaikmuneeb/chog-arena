// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {ChogShield} from "../src/ChogShield.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";

/// @notice Deploys the arena stack to Monad (mainnet chain id 41454, or testnet) in the
/// order the contracts depend on each other: ChogShield first (it needs the Chog NFT
/// address), then PredictionMarket wired to that shield, then the shield authorizes the
/// market so its recordLoss() calls are accepted (and so it can rake the fee split in).
///
/// This script is NOT run automatically — execute it yourself with your own deployer key:
///
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url monad_mainnet \
///     --broadcast
///
/// Required env vars (shell or an untracked .env file):
///   PRIVATE_KEY       - deployer key (also becomes the owner of both contracts)
///   CHOG_NFT_ADDRESS  - deployed Chog NFT (ERC721) the shield gates bailouts on
///   TREASURY_ADDRESS  - receives the 40% treasury cut of the 2.5% protocol rake
///
/// Never commit a real private key to this repo.
contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address chogNftAddress = vm.envAddress("CHOG_NFT_ADDRESS");
        address treasuryAddress = vm.envAddress("TREASURY_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        ChogShield shield = new ChogShield(chogNftAddress);
        console2.log("ChogShield deployed at", address(shield));

        PredictionMarket market = new PredictionMarket(payable(address(shield)), treasuryAddress);
        console2.log("PredictionMarket deployed at", address(market));

        shield.setAuthorizedMarket(address(market));

        vm.stopBroadcast();

        console2.log("\nChogShield authorized market set to", address(market));
        console2.log("Next steps (manual, NOT part of this script):");
        console2.log("1. Fund ChogShield with MON - it pays bailouts from its own balance.");
        console2.log("2. Deploy the Chog NFT first if it isn't live yet, then set CHOG_NFT_ADDRESS.");
        console2.log("3. Paste these addresses into your frontend/operator config.");
    }
}
