// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "./circuits/verifier.sol";

uint8 constant LIFE = 2;

contract Game {
    PlonkVerifier immutable verifier;

    struct Player {
        uint256 previous_hash;
        address payable addr;
        uint8 numHit;
    }
    uint8 public enemy_shot;
    uint256 public turn;
    Player[2] public players;

    constructor() {
        verifier = new PlonkVerifier();
    }

    function start(uint256 locationHash) external payable {
        if (players[1].addr != address(0)) {
            revert("already started");
        }
        players[1].previous_hash = locationHash;
        players[1].addr = payable(msg.sender);
    }

    // there is no point ending with listen and or call it twice
    // this is a special function that ask the other player to reveal some info about its position
    // listen can be prefixed by an action, but there is no real sense it should end the turn
    // even the number of prefix that make sense is limited
    // - reveal room to get listen boost
    // - reveal toom to get free ap
    // - the last one could let you move first and then listen, but this is technically not a good strategy as you could have listen first and acted accordingly
    // so we have reveal+listen or listen as potential first half move, which then need to wait for the other player to reply
    // function listen() external {

    // }

    function acceptAndMove(
        uint256 prevHash,
        bytes calldata proof,
        bool hit,
        uint256 new_hash,
        uint8 shot
    ) external payable {
        require(turn == 0, "ALREADY_STARTED");
        require(players[1].addr != address(0), "NO_OTHER_PLAYER");

        Player memory player = players[0];
        player.addr = payable(msg.sender);
        player.previous_hash = prevHash;

        require(msg.value >= address(this).balance, "NEED_MORE");

        _move(player, proof, hit, new_hash, shot);
    }

    function move(
        bytes calldata proof,
        bool hit,
        uint256 new_hash,
        uint8 shot
    ) external {
        uint256 playerIndex = turn % 2;
        Player memory player = players[playerIndex];

        require(turn > 0, "NOT_STARTED");
        require(msg.sender == player.addr, "NOT_UR_TURN");

        if (player.numHit >= LIFE) {
            revert("NO MORE LIFE");
        }
        _move(player, proof, hit, new_hash, shot);
    }

    function _move(
        Player memory player,
        bytes calldata proof,
        bool hit,
        uint256 new_hash,
        uint8 shot
    ) internal {
        uint256 playerIndex = turn % 2;
        uint256[] memory publicSignals = new uint256[](4);
        publicSignals[0] = new_hash;
        publicSignals[1] = enemy_shot;
        publicSignals[2] = hit ? 1 : 0;
        publicSignals[3] = player.previous_hash;
        // publicSignals[3] = ;

        bool verified = verifier.verifyProof(proof, publicSignals);

        if (!verified) {
            revert("INVALID_PROOF");
        }
        if (hit) {
            player.numHit++;
        }
        player.previous_hash = new_hash;

        players[playerIndex] = player;

        enemy_shot = shot;

        turn++;
    }

    function withdraw() external {
        // TODO timeout in case the loser do not want to abdict
        Player storage player1 = players[0];
        Player storage player2 = players[0];
        if (player1.numHit >= LIFE) {
            player2.addr.transfer(address(this).balance);
        } else if (player2.numHit >= LIFE) {
            player1.addr.transfer(address(this).balance);
        }
    }
}
