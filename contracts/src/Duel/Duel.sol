// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.28;

import {ZKMatches} from "../zk-game/ZKMatches.sol";
import {IZKVerifier} from "../zk-game/IZKVerifier.sol";
import {Proxied} from "@rocketh/proxy/solc_0_8/ERC1967/Proxied.sol";

/// @title Duel
/// @notice duel-in-the-dark: two crews hunting each other through a ship in
///         the dark. Each player's room, traps and Remote Charge are hidden
///         behind a commitment; every action is proven, shots, detonations
///         and room effects reveal what they must, and the other player
///         answers every query with a proof. Two hits lose.
///
/// THE CIRCUITS ARE THE RULES. Every action is a whole-state transition
/// (circuits/duel/src/lib.nr): a proof that the public match `State` after it
/// is exactly what the action does to the `State` before it. So this contract
/// holds no duel rule. It builds the BEFORE state from storage, takes the
/// AFTER state from the caller (the claimed result, bound by the proof), and
/// applies the difference through {ZKMatches}: the commitments, the action
/// points, the queries, the end of the match.
///
/// It knows two facts about the state, both public: a phase from `QUERY` up is
/// answered by the other seat, and a turn holder whose Remote Charge is due
/// may not end the turn ({_turnMayEnd}).
///
/// The verifier's public inputs are `[state, next]`, each the 16 fields of
/// {State} in declaration order (see `_stateInputs`).
contract Duel is ZKMatches, Proxied {
    uint8 public constant ACTION_POINTS = 2;

    // phases, as in circuits/duel/src/lib.nr
    uint8 internal constant PLAY = 0;
    uint8 internal constant OVER = 2;
    /// @notice from here up, the other seat must answer
    uint8 internal constant QUERY = 16;

    // which verifier {act} checks a proof with
    uint8 internal constant MOVE = 0;
    uint8 internal constant SHOOT = 1;
    uint8 internal constant TRAP = 2;
    uint8 internal constant EFFECT = 3;
    uint8 internal constant ANSWER = 4;

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
        /// @notice the public data of the last action or the pending query
        uint8 argA;
        uint8 argB;
        /// @notice the room a Coolant Purge sealed (in force for a while)
        uint8 sealedRoom;
        /// @notice the turn number (ZKMatches)
        uint32 turn;
        /// @notice the turn in which the turn holder last acted
        uint32 acted;
        /// @notice the turn `sealedRoom` was sealed in
        uint32 sealedTurn;
        /// @notice the turn the Motion Tracker was last used in
        uint32 tracked;
        /// @notice bit s set while seat s has a Remote Charge set
        uint8 armed;
        /// @notice the action that produced this state
        uint8 last;
    }

    /// @notice What Duel stores beyond ZKMatches: the rest of {State}.
    struct Board {
        uint8[2] hits;
        uint8 phase;
        uint8 argA;
        uint8 argB;
        uint8 sealedRoom;
        uint32 acted;
        uint32 sealedTurn;
        uint32 tracked;
        uint8 armed;
        uint8 last;
    }

    /// @notice A proven transition, with what is public about it: the action
    ///         (`last`), its data or answer (`argA`, `argB`), the phase it
    ///         leads to and the score. The history of a match is the sequence
    ///         of these; the full state is {getState}.
    event Acted(
        uint256 indexed matchId,
        uint8 seat,
        uint8 last,
        uint8 phase,
        uint8 argA,
        uint8 argB,
        uint8[2] hits
    );

    error NoSuchCircuit(uint8 circuit);

    /// @notice duel_start(commitment): a valid starting state
    IZKVerifier public immutable startVerifier;
    IZKVerifier public immutable moveVerifier;
    IZKVerifier public immutable shootVerifier;
    IZKVerifier public immutable trapVerifier;
    IZKVerifier public immutable effectVerifier;
    IZKVerifier public immutable answerVerifier;

    mapping(uint256 matchId => Board) internal _boards;

    constructor(
        IZKVerifier startVerifier_,
        IZKVerifier moveVerifier_,
        IZKVerifier shootVerifier_,
        IZKVerifier trapVerifier_,
        IZKVerifier effectVerifier_,
        IZKVerifier answerVerifier_,
        uint64 turnDuration_,
        uint64 responseDuration_
    ) ZKMatches(turnDuration_, responseDuration_) {
        startVerifier = startVerifier_;
        moveVerifier = moveVerifier_;
        shootVerifier = shootVerifier_;
        trapVerifier = trapVerifier_;
        effectVerifier = effectVerifier_;
        answerVerifier = answerVerifier_;
    }

    // ------------------------------------------------------------------------
    // ACTIONS
    // ------------------------------------------------------------------------

    /// @notice Take an action, or answer the pending query: `next` is the
    ///         state it leads to, and `proof` shows it follows from the current
    ///         one by the rules of `circuit` (MOVE, SHOOT, TRAP, EFFECT or
    ///         ANSWER). Any verifier may be named: each accepts only legal
    ///         transitions.
    function act(
        uint256 matchId,
        address player,
        uint8 circuit,
        State calldata next,
        bytes calldata proof
    ) external {
        Board storage b = _boards[matchId];
        // A query is answered by the other seat; every other phase is the
        // turn holder's, and the circuit decides what each phase allows.
        uint8 seat =
            b.phase >= QUERY
                ? _requireResponder(matchId, player)
                : _requireTurn(matchId, player);

        State memory state = getState(matchId);
        _verify(_verifier(circuit), proof, _stateInputs(state, next));

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
        b.acted = next.acted;
        b.sealedTurn = next.sealedTurn;
        b.tracked = next.tracked;
        b.armed = next.armed;
        b.last = next.last;

        if (next.phase >= QUERY && state.phase < QUERY) {
            _openQuery(matchId, uint8(1) << _otherSeat(state.actor));
        } else if (state.phase >= QUERY && next.phase < QUERY) {
            _answered(matchId, seat);
        }
        emit Acted(
            matchId,
            seat,
            next.last,
            next.phase,
            next.argA,
            next.argB,
            next.hits
        );
        if (next.phase == OVER) {
            // Every hit lands on the seat answering the turn holder's query,
            // so only the turn holder can win by an action.
            _finish(matchId, state.actor, false);
        }
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
        s.turn = m.turn;
        s.acted = b.acted;
        s.sealedTurn = b.sealedTurn;
        s.tracked = b.tracked;
        s.armed = b.armed;
        s.last = b.last;
    }

    /// @notice The verifier's public inputs for a transition, in circuit
    ///         order. Every field of {State} is static, so its ABI encoding is
    ///         already one 32-byte word per field, in declaration order: the
    ///         circuit's order. The encoding is reused as a `bytes32[]` by
    ///         setting its length to the number of words.
    function _stateInputs(
        State memory state,
        State calldata next
    ) internal pure returns (bytes32[] memory inputs) {
        bytes memory encoded = abi.encode(state, next);
        assembly ("memory-safe") {
            inputs := encoded
            mstore(inputs, shr(5, mload(encoded)))
        }
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

    /// @notice The turn waits while something is owed in it: the free move
    ///         after a shot (any phase but PLAY), or the turn holder's Remote
    ///         Charge going off at the start of its turn (the same public
    ///         predicate as `charge_due` in the circuits).
    function _turnMayEnd(
        uint256 matchId
    ) internal view override returns (bool) {
        Board storage b = _boards[matchId];
        Match storage m = _matches[matchId];
        bool chargeDue = (b.armed >> m.turnSeat) & 1 == 1 && b.acted != m.turn;
        return b.phase == PLAY && !chargeDue;
    }

    // ------------------------------------------------------------------------
    // INTERNALS
    // ------------------------------------------------------------------------

    function _verifier(uint8 circuit) internal view returns (IZKVerifier) {
        if (circuit == MOVE) return moveVerifier;
        if (circuit == SHOOT) return shootVerifier;
        if (circuit == TRAP) return trapVerifier;
        if (circuit == EFFECT) return effectVerifier;
        if (circuit == ANSWER) return answerVerifier;
        revert NoSuchCircuit(circuit);
    }
}
