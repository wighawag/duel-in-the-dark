// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../src/Game.sol";
import "../script/deploy_Game.s.sol";

contract CounterTest is Test {
    Game public game;

    function setUp() public {
        game = new GameDeployScript().run();
    }
}
