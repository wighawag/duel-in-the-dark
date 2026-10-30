// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.28;

import {ZKMatches} from "../zk-game/ZKMatches.sol";
import {IZKVerifier} from "../zk-game/IZKVerifier.sol";
import {Proxied} from "@rocketh/proxy/solc_0_8/ERC1967/Proxied.sol";

/// @title HideAndSeek
/// @notice The template's reference game: as little game as it takes to use
///         every part of {ZKMatches}. A descendant replaces it with its own.
///
/// Each player hides in one of 8 cells arranged in a ring; nobody, the
/// contract included, knows which. A turn has 2 action points:
/// - `move` (1 AP): step to a neighbouring cell, proven, still hidden.
/// - `guess` (1 AP): name a cell. That opens a QUERY: the opponent must answer
///   with a proof of whether they are there, before the turn can go on.
/// The first correct guess takes both stakes. Not answering, or not acting,
/// before the deadline loses the same way.
///
/// The three circuits (circuits/in_range, move_on_ring, answer_guess) each
/// have a generated verifier; their public inputs are listed in the order
/// the circuit declares them, and built here from storage, never taken from
/// the caller.
contract HideAndSeek is ZKMatches, Proxied {
    uint8 public constant CELLS = 8;
    uint8 public constant ACTION_POINTS = 2;

    event Moved(uint256 indexed matchId, uint8 seat);
    event Guessed(uint256 indexed matchId, uint8 seat, uint8 cell);
    event GuessAnswered(
        uint256 indexed matchId,
        uint8 seat,
        uint8 cell,
        bool hit
    );

    error NoSuchCell(uint8 cell);

    /// @notice in_range(max, commitment): the starting cell is on the board
    IZKVerifier public immutable inRangeVerifier;
    /// @notice move_on_ring(commitment, new_commitment): a step to a neighbour
    IZKVerifier public immutable moveVerifier;
    /// @notice answer_guess(commitment, guess, hit): the truthful answer
    IZKVerifier public immutable answerVerifier;

    /// @notice the cell named by the open guess of each match
    mapping(uint256 matchId => uint8 cell) public pendingGuess;

    constructor(
        IZKVerifier inRangeVerifier_,
        IZKVerifier moveVerifier_,
        IZKVerifier answerVerifier_,
        uint64 turnDuration_,
        uint64 responseDuration_
    ) ZKMatches(turnDuration_, responseDuration_) {
        inRangeVerifier = inRangeVerifier_;
        moveVerifier = moveVerifier_;
        answerVerifier = answerVerifier_;
    }

    // ------------------------------------------------------------------------
    // ACTIONS
    // ------------------------------------------------------------------------

    function move(
        uint256 matchId,
        address player,
        bytes32 newCommitment,
        bytes calldata proof
    ) external {
        uint8 seat = _requireTurn(matchId, player);
        _spendActionPoints(matchId, 1);

        bytes32[] memory inputs = new bytes32[](2);
        inputs[0] = _commitmentOf(matchId, seat);
        inputs[1] = newCommitment;
        _verify(moveVerifier, proof, inputs);

        _setCommitment(matchId, seat, newCommitment);
        emit Moved(matchId, seat);
        _settle(matchId);
    }

    function guess(uint256 matchId, address player, uint8 cell) external {
        uint8 seat = _requireTurn(matchId, player);
        if (cell >= CELLS) {
            revert NoSuchCell(cell);
        }
        _spendActionPoints(matchId, 1);

        pendingGuess[matchId] = cell;
        _openQuery(matchId, uint8(1) << _otherSeat(seat));
        emit Guessed(matchId, seat, cell);
    }

    function answerGuess(
        uint256 matchId,
        address player,
        bool hit,
        bytes calldata proof
    ) external {
        uint8 seat = _requireResponder(matchId, player);
        uint8 cell = pendingGuess[matchId];

        bytes32[] memory inputs = new bytes32[](3);
        inputs[0] = _commitmentOf(matchId, seat);
        inputs[1] = bytes32(uint256(cell));
        inputs[2] = bytes32(uint256(hit ? 1 : 0));
        _verify(answerVerifier, proof, inputs);

        _answered(matchId, seat);
        emit GuessAnswered(matchId, seat, cell, hit);
        if (hit) {
            _finish(matchId, _otherSeat(seat), false);
        } else {
            _settle(matchId);
        }
    }

    // ------------------------------------------------------------------------
    // HOOKS
    // ------------------------------------------------------------------------

    function _validateInitialCommitment(
        bytes32 commitment,
        bytes calldata proof
    ) internal view override {
        bytes32[] memory inputs = new bytes32[](2);
        inputs[0] = bytes32(uint256(CELLS));
        inputs[1] = commitment;
        _verify(inRangeVerifier, proof, inputs);
    }

    function _actionPointsAtTurnStart(
        uint256,
        uint8
    ) internal pure override returns (uint8) {
        return ACTION_POINTS;
    }
}
