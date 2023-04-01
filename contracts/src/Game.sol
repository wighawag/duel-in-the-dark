// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "../circuits/verifier.sol";

contract Game {
    PlonkVerifier immutable verifier;

    constructor() {
        verifier = new PlonkVerifier();
    }
}
