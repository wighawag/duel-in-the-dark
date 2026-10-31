// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.28;

import {ZKMatches} from "../zk-game/ZKMatches.sol";
import {IZKVerifier} from "../zk-game/IZKVerifier.sol";
import {Proxied} from "@rocketh/proxy/solc_0_8/ERC1967/Proxied.sol";

/// @title Duel
/// @notice duel-in-the-dark: two crews hunting each other through a ship in
///         the dark. Each player's room is hidden behind a commitment; moving
///         is proven, shooting reveals the shooter's room, and the target
///         answers with a proof of whether it was hit. Two hits lose.
///
/// THE CIRCUITS ARE THE RULES. Every action is a whole-state transition
/// (circuits/duel/src/lib.nr): a proof that the public match `State` after it
/// is exactly what the action does to the `State` before it. So this contract
/// holds no duel rule. It builds the BEFORE state from storage, takes the
/// AFTER state from the caller (the claimed result, bound by the proof), and
/// applies the difference through {ZKMatches}: the commitments, the action
/// points, the query a shot opens and its answer closes, the end of the match.
///
/// The verifier's public inputs are `[state, next]`, each the 10 fields of
/// {State} in declaration order (see `stateInputs`).
contract Duel is ZKMatches, Proxied {
    uint8 public constant ACTION_POINTS = 2;

    // phases, as in circuits/duel/src/lib.nr
    uint8 internal constant PLAY = 0;
    uint8 internal constant SHOT = 1;
    uint8 internal constant MOVE_AFTER_SHOT = 2;
    uint8 internal constant OVER = 3;

    /// @notice The public state of a match exactly as the circuits see it.
    struct State {
        bytes32[2] commitments;
        /// @notice hits TAKEN by each seat
        uint8[2] hits;
        /// @notice the turn holder
        uint8 actor;
        /// @notice action points the turn holder has left
        uint8 ap;
        uint8 phase;
        /// @notice milestone C: the room the pending shot came from
        uint8 argA;
        /// @notice milestone C: the room the pending shot went into
        uint8 argB;
        /// @notice the sealed room, 0 = none (reserved for later rules)
        uint8 sealedRoom;
    }

    /// @notice What Duel stores beyond ZKMatches: the rest of {State}.
    struct Board {
        uint8[2] hits;
        uint8 phase;
        uint8 argA;
        uint8 argB;
        uint8 sealedRoom;
    }

    event Moved(uint256 indexed matchId, uint8 seat);
    event Shot(
        uint256 indexed matchId,
        uint8 seat,
        uint8 fromRoom,
        uint8 intoRoom
    );
    event ShotAnswered(uint256 indexed matchId, uint8 seat, bool hit);

    /// @notice duel_start(commitment): a valid starting state
    IZKVerifier public immutable startVerifier;
    /// @notice duel_move(state, next)
    IZKVerifier public immutable moveVerifier;
    /// @notice duel_shoot(state, next)
    IZKVerifier public immutable shootVerifier;
    /// @notice duel_answer_shot(state, next)
    IZKVerifier public immutable answerShotVerifier;

    mapping(uint256 matchId => Board) internal _boards;

    constructor(
        IZKVerifier startVerifier_,
        IZKVerifier moveVerifier_,
        IZKVerifier shootVerifier_,
        IZKVerifier answerShotVerifier_,
        uint64 turnDuration_,
        uint64 responseDuration_
    ) ZKMatches(turnDuration_, responseDuration_) {
        startVerifier = startVerifier_;
        moveVerifier = moveVerifier_;
        shootVerifier = shootVerifier_;
        answerShotVerifier = answerShotVerifier_;
    }

    // ------------------------------------------------------------------------
    // ACTIONS
    // ------------------------------------------------------------------------

    /// @notice Move to an adjacent room, hidden (1 AP), or make the free move
    ///         owed after a shot.
    function move(
        uint256 matchId,
        address player,
        State calldata next,
        bytes calldata proof
    ) external {
        uint8 seat = _transition(matchId, player, moveVerifier, next, proof);
        emit Moved(matchId, seat);
        _settle(matchId);
    }

    /// @notice Shoot (2 AP), revealing the room shot from. The target must
    ///         answer ({answerShot}) before the turn goes on.
    function shoot(
        uint256 matchId,
        address player,
        State calldata next,
        bytes calldata proof
    ) external {
        uint8 seat = _transition(matchId, player, shootVerifier, next, proof);
        emit Shot(matchId, seat, next.argA, next.argB);
        _settle(matchId);
    }

    /// @notice Answer the pending shot, truthfully: the proof binds the hit.
    function answerShot(
        uint256 matchId,
        address player,
        State calldata next,
        bytes calldata proof
    ) external {
        uint8 before = _boards[matchId].hits[
            _otherSeat(_matches[matchId].turnSeat)
        ];
        uint8 seat = _transition(
            matchId,
            player,
            answerShotVerifier,
            next,
            proof
        );
        emit ShotAnswered(matchId, seat, next.hits[seat] > before);
        _settle(matchId);
    }

    // ------------------------------------------------------------------------
    // VIEWS
    // ------------------------------------------------------------------------

    /// @notice The state a proof for this match's next action must start from.
    function getState(uint256 matchId) public view returns (State memory s) {
        Match storage m = _matches[matchId];
        Board storage b = _boards[matchId];
        s.commitments[0] = _commitmentOf(matchId, 0);
        s.commitments[1] = _commitmentOf(matchId, 1);
        s.hits = b.hits;
        s.actor = m.turnSeat;
        s.ap = m.actionPoints;
        s.phase = b.phase;
        s.argA = b.argA;
        s.argB = b.argB;
        s.sealedRoom = b.sealedRoom;
    }

    /// @notice The verifier's public inputs for a transition, in circuit order.
    function stateInputs(
        State memory state,
        State memory next
    ) public pure returns (bytes32[] memory inputs) {
        inputs = new bytes32[](20);
        _write(inputs, 0, state);
        _write(inputs, 10, next);
    }

    // ------------------------------------------------------------------------
    // HOOKS
    // ------------------------------------------------------------------------

    function _validateInitialCommitment(
        bytes32 commitment,
        bytes calldata proof
    ) internal view override {
        bytes32[] memory inputs = new bytes32[](1);
        inputs[0] = commitment;
        _verify(startVerifier, proof, inputs);
    }

    function _actionPointsAtTurnStart(
        uint256,
        uint8
    ) internal pure override returns (uint8) {
        return ACTION_POINTS;
    }

    /// @notice The turn waits while the shooter owes the free move.
    function _turnMayEnd(
        uint256 matchId
    ) internal view override returns (bool) {
        return _boards[matchId].phase == PLAY;
    }

    // ------------------------------------------------------------------------
    // INTERNALS
    // ------------------------------------------------------------------------

    /// @notice Verify `next` follows from the stored state by `verifier`'s
    ///         rule, and apply it. Returns the seat that acted.
    function _transition(
        uint256 matchId,
        address player,
        IZKVerifier verifier,
        State calldata next,
        bytes calldata proof
    ) internal returns (uint8 seat) {
        Board storage b = _boards[matchId];
        // A pending shot is answered by its target; every other phase is the
        // turn holder's, and the circuit decides what each phase allows.
        seat =
            b.phase == SHOT
                ? _requireResponder(matchId, player)
                : _requireTurn(matchId, player);

        State memory state = getState(matchId);
        _verify(verifier, proof, stateInputs(state, next));

        for (uint8 i = 0; i < SEATS; i++) {
            if (next.commitments[i] != state.commitments[i]) {
                _setCommitment(matchId, i, next.commitments[i]);
            }
        }
        if (next.ap < state.ap) {
            _spendActionPoints(matchId, state.ap - next.ap);
        } else if (next.ap > state.ap) {
            _grantActionPoints(matchId, next.ap - state.ap);
        }
        b.hits = next.hits;
        b.phase = next.phase;
        b.argA = next.argA;
        b.argB = next.argB;
        b.sealedRoom = next.sealedRoom;

        if (next.phase == SHOT && state.phase != SHOT) {
            _openQuery(matchId, uint8(1) << _otherSeat(state.actor));
        } else if (state.phase == SHOT && next.phase != SHOT) {
            _answered(matchId, seat);
        }
        if (next.phase == OVER) {
            // Only the turn holder's action can end a duel: the other seat
            // took its last hit (a trap never hits its setter, later on).
            _finish(matchId, state.actor, false);
        }
    }

    function _write(
        bytes32[] memory inputs,
        uint256 at,
        State memory s
    ) private pure {
        inputs[at] = s.commitments[0];
        inputs[at + 1] = s.commitments[1];
        inputs[at + 2] = bytes32(uint256(s.hits[0]));
        inputs[at + 3] = bytes32(uint256(s.hits[1]));
        inputs[at + 4] = bytes32(uint256(s.actor));
        inputs[at + 5] = bytes32(uint256(s.ap));
        inputs[at + 6] = bytes32(uint256(s.phase));
        inputs[at + 7] = bytes32(uint256(s.argA));
        inputs[at + 8] = bytes32(uint256(s.argB));
        inputs[at + 9] = bytes32(uint256(s.sealedRoom));
    }
}
