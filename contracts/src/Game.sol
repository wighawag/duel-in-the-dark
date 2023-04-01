// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "../circuits/verifier.sol";

uint8 constant LIFE = 2;

contract Game {
    PlonkVerifier immutable verifier;

    struct Player {
        uint256 previous_hash;
        uint8 numHit;
    }
    uint8 internal enemy_shot;
    uint256 internal turn;
    Player[2] internal players;

    constructor() {
        verifier = new PlonkVerifier();
    }

    function move(bytes calldata proof, bool hit, uint256 new_hash) external {
        uint256 playerIndex = turn % 2;
        Player memory player = players[playerIndex];
        if (player.numHit >= LIFE) {
            revert("NO MORE LIFE");
        }
        uint256[] memory publicSignals = new uint256[](4);
        publicSignals[0] = enemy_shot;
        publicSignals[1] = hit ? 1 : 0;
        publicSignals[2] = player.previous_hash;
        publicSignals[3] = new_hash;

        bool verified = verifier.verifyProof(proof, publicSignals);

        if (!verified) {
            revert("INVALID_PROOF");
        }
        if (hit) {
            player.numHit++;
        }
        player.previous_hash = new_hash;

        players[playerIndex] = player;

        turn++;
    }

    function withdraw() external {
        // TODO
    }
}
