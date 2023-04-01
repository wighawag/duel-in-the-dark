// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/Game.sol";

contract GameDeployScript is Script {
    function setUp() public {}

    function run() public returns (Game game) {
        vm.broadcast();
        game = new Game();
    }
}
