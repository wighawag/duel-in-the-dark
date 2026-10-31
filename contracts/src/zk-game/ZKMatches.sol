// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.28;

import {UsingDelegation} from "@etherplay/delegation/contracts/UsingDelegation.sol";
import {IZKVerifier} from "./IZKVerifier.sol";

/// @title ZKMatches
/// @notice The framework every game on this template shares: many concurrent
///         matches, each with seats, an escrowed stake, a commitment per seat
///         standing for that player's HIDDEN state, alternating turns paid for
///         in action points, QUERIES the other seats must answer with a proof,
///         deadlines on every wait, and payout.
///
/// IT KNOWS NOTHING OF A GAME'S RULES. A game inherits this, adds its actions
/// as functions, and in each one: asks who may act ({_requireTurn} or
/// {_requireResponder}), checks a proof against PUBLIC INPUTS IT BUILDS ITSELF
/// from storage ({_verify}), applies the result ({_setCommitment},
/// {_spendActionPoints}, {_openQuery}, {_answered}, {_finish}), and ends with
/// {_settle}, which passes the turn once nothing is left to do in it.
///
/// THE PUBLIC INPUTS ARE NEVER TAKEN FROM THE CALLER. A proof is only as good
/// as the statement it is checked against: a game that let a player submit the
/// commitment their proof refers to would let them prove things about a state
/// they made up. Commitments come from storage, query data from the pending
/// query, and only the claimed RESULT (a hit, a new commitment) comes from the
/// caller, bound by the proof.
///
/// HIDDEN STATE IS A COMMITMENT CHAIN. Each seat's commitment is replaced only
/// by a proven transition from the previous one, so the chain is the player's
/// history without revealing it. Losing the secret behind it (value and salt)
/// means being unable to prove anything again, which ends in a timeout: the
/// web side must keep those secrets safe.
///
/// WHO ACTS. Every action takes the `player` it is for and checks the sender
/// may act for them ({UsingDelegation}), so a browser's signer plays without
/// wallet prompts. Winnings are credited to the player, and only the player
/// itself can withdraw them: a delegate never moves value out.
///
/// TWO SEATS. The waiting logic is written over a bitmask of seats so that a
/// query can be addressed to several responders, but the lifecycle (who wins a
/// timeout, who goes next) is the two-seat one. Games with more seats extend
/// it rather than pretend it already works.
abstract contract ZKMatches is UsingDelegation {
    // ------------------------------------------------------------------------
    // TYPES
    // ------------------------------------------------------------------------

    uint8 internal constant SEATS = 2;

    /// @notice BN254 scalar field modulus: a commitment is a field element.
    uint256 internal constant FIELD_MODULUS =
        0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001;

    enum Status {
        None,
        Open,
        Active,
        Finished,
        Cancelled
    }

    struct Match {
        Status status;
        /// @notice whose turn it is, when Active
        uint8 turnSeat;
        /// @notice what the turn holder may still spend this turn
        uint8 actionPoints;
        /// @notice seats that owe an answer to the open query (bit i = seat i)
        uint8 awaiting;
        /// @notice the winning seat, when Finished
        uint8 winner;
        /// @notice when whoever is being waited for must have acted
        uint64 deadline;
        /// @notice what each seat put at stake; the winner takes all
        uint128 stake;
    }

    struct Seat {
        address player;
        bytes32 commitment;
    }

    struct MatchView {
        Match state;
        Seat[SEATS] seats;
    }

    // ------------------------------------------------------------------------
    // EVENTS / ERRORS
    // ------------------------------------------------------------------------

    event MatchCreated(
        uint256 indexed matchId,
        address indexed creator,
        uint256 stake
    );
    event MatchJoined(
        uint256 indexed matchId,
        address indexed player,
        uint8 seat
    );
    event MatchCancelled(uint256 indexed matchId);
    event TurnStarted(
        uint256 indexed matchId,
        uint8 seat,
        uint8 actionPoints,
        uint64 deadline
    );
    event QueryOpened(uint256 indexed matchId, uint8 awaiting, uint64 deadline);
    event QueryAnswered(uint256 indexed matchId, uint8 seat);
    event CommitmentUpdated(
        uint256 indexed matchId,
        uint8 seat,
        bytes32 commitment
    );
    event MatchFinished(
        uint256 indexed matchId,
        uint8 winner,
        address indexed player,
        bool byTimeout
    );
    event Withdrawn(address indexed player, uint256 amount);

    error NoSuchMatch(uint256 matchId);
    error NotOpen(uint256 matchId);
    error NotActive(uint256 matchId);
    error WrongStake(uint256 expected, uint256 got);
    error AlreadySeated(address player);
    error NotCreator(address player);
    error NotYourTurn(address player);
    error QueryPending(uint256 matchId);
    error NotAwaited(address player);
    error DeadlinePassed(uint64 deadline);
    error DeadlineNotPassed(uint64 deadline);
    error NotEnoughActionPoints(uint8 available, uint8 needed);
    error TurnNotOver(uint256 matchId);
    error NotAFieldElement(bytes32 value);
    error InvalidProof();
    error NothingToWithdraw();
    error TransferFailed();

    // ------------------------------------------------------------------------
    // STORAGE
    // ------------------------------------------------------------------------

    /// @notice how long a turn holder has to act, from the start of the turn
    ///         or from the last answer to their query
    uint64 public immutable turnDuration;
    /// @notice how long a queried seat has to answer
    uint64 public immutable responseDuration;

    uint256 internal _lastMatchId;
    mapping(uint256 matchId => Match) internal _matches;
    mapping(uint256 matchId => Seat[SEATS]) internal _seats;
    /// @notice winnings and refunds, withdrawn by the player
    mapping(address player => uint256 amount) public balanceOf;

    constructor(uint64 turnDuration_, uint64 responseDuration_) {
        turnDuration = turnDuration_;
        responseDuration = responseDuration_;
    }

    // ------------------------------------------------------------------------
    // LIFECYCLE
    // ------------------------------------------------------------------------

    /// @notice Open a match, staking `msg.value` and committing to a hidden
    ///         initial state that `proof` shows to be valid for this game.
    function createMatch(
        address player,
        bytes32 commitment,
        bytes calldata proof
    ) external payable returns (uint256 matchId) {
        address account = _requireAccountForSender(player);
        _requireFieldElement(commitment);
        _validateInitialCommitment(commitment, proof);

        matchId = ++_lastMatchId;
        Match storage m = _matches[matchId];
        m.status = Status.Open;
        m.stake = uint128(msg.value);
        _seats[matchId][0] = Seat({player: account, commitment: commitment});

        emit MatchCreated(matchId, account, msg.value);
        emit MatchJoined(matchId, account, 0);
    }

    /// @notice Take the free seat of an open match, matching its stake, which
    ///         starts it.
    function joinMatch(
        uint256 matchId,
        address player,
        bytes32 commitment,
        bytes calldata proof
    ) external payable {
        address account = _requireAccountForSender(player);
        Match storage m = _matches[matchId];
        if (m.status != Status.Open) {
            revert NotOpen(matchId);
        }
        if (msg.value != m.stake) {
            revert WrongStake(m.stake, msg.value);
        }
        if (_seats[matchId][0].player == account) {
            revert AlreadySeated(account);
        }
        _requireFieldElement(commitment);
        _validateInitialCommitment(commitment, proof);

        _seats[matchId][1] = Seat({player: account, commitment: commitment});
        m.status = Status.Active;
        emit MatchJoined(matchId, account, 1);

        _startTurn(matchId, _firstSeat(matchId));
    }

    /// @notice The creator takes their stake back from a match nobody joined.
    function cancelMatch(uint256 matchId, address player) external {
        address account = _requireAccountForSender(player);
        Match storage m = _matches[matchId];
        if (m.status != Status.Open) {
            revert NotOpen(matchId);
        }
        if (_seats[matchId][0].player != account) {
            revert NotCreator(account);
        }
        m.status = Status.Cancelled;
        balanceOf[account] += m.stake;
        emit MatchCancelled(matchId);
    }

    /// @notice Anyone may end a match whose deadline passed: whoever was being
    ///         waited for loses. If a query was open, that is the seat that did
    ///         not answer; otherwise the turn holder.
    function claimTimeout(uint256 matchId) external {
        Match storage m = _matches[matchId];
        if (m.status != Status.Active) {
            revert NotActive(matchId);
        }
        if (block.timestamp <= m.deadline) {
            revert DeadlineNotPassed(m.deadline);
        }
        uint8 winner = m.awaiting != 0 ? m.turnSeat : _otherSeat(m.turnSeat);
        _finish(matchId, winner, true);
    }

    /// @notice Withdraw winnings and refunds. Only the player, never a
    ///         delegate: a key held by a browser must not be able to drain an
    ///         account.
    function withdraw() external {
        uint256 amount = balanceOf[msg.sender];
        if (amount == 0) {
            revert NothingToWithdraw();
        }
        balanceOf[msg.sender] = 0;
        emit Withdrawn(msg.sender, amount);
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) {
            revert TransferFailed();
        }
    }

    /// @notice A player passes the rest of their turn, unless the game says
    ///         something is still owed in it ({_turnMayEnd}).
    function endTurn(uint256 matchId, address player) external {
        _requireTurn(matchId, player);
        if (!_turnMayEnd(matchId)) {
            revert TurnNotOver(matchId);
        }
        _matches[matchId].actionPoints = 0;
        _settle(matchId);
    }

    // ------------------------------------------------------------------------
    // VIEWS
    // ------------------------------------------------------------------------

    function getMatch(
        uint256 matchId
    ) external view returns (MatchView memory) {
        return MatchView({state: _matches[matchId], seats: _seats[matchId]});
    }

    function lastMatchId() external view returns (uint256) {
        return _lastMatchId;
    }

    // ------------------------------------------------------------------------
    // HOOKS: what a game decides
    // ------------------------------------------------------------------------

    /// @notice Revert unless `proof` shows `commitment` hides a valid starting
    ///         state for this game.
    function _validateInitialCommitment(
        bytes32 commitment,
        bytes calldata proof
    ) internal view virtual;

    /// @notice How many action points `seat` gets at the start of its turn.
    function _actionPointsAtTurnStart(
        uint256 matchId,
        uint8 seat
    ) internal view virtual returns (uint8);

    /// @notice Whether the turn holder may stop now. Return false while the
    ///         game's rules still owe an action in this turn, one that costs no
    ///         action point and is not a query (a forced move after a shot,
    ///         say): the turn then neither passes in {_settle} nor ends by
    ///         {endTurn}, and a timeout falls on the turn holder.
    function _turnMayEnd(uint256) internal view virtual returns (bool) {
        return true;
    }

    /// @notice Which seat plays first. Defaults to a coin flip on
    ///         `block.prevrandao`, which a block proposer could bias by one bit;
    ///         acceptable for who-goes-first, not for anything with a payout.
    function _firstSeat(uint256 matchId) internal view virtual returns (uint8) {
        return
            uint8(
                uint256(keccak256(abi.encode(block.prevrandao, matchId))) %
                    SEATS
            );
    }

    // ------------------------------------------------------------------------
    // HELPERS: what a game's actions call
    // ------------------------------------------------------------------------

    /// @notice The seat whose turn it is, if `player` is its occupant and the
    ///         sender may act for them, no query is pending and the turn has
    ///         not run out.
    function _requireTurn(
        uint256 matchId,
        address player
    ) internal view returns (uint8 seat) {
        Match storage m = _matches[matchId];
        if (m.status != Status.Active) {
            revert NotActive(matchId);
        }
        if (m.awaiting != 0) {
            revert QueryPending(matchId);
        }
        if (block.timestamp > m.deadline) {
            revert DeadlinePassed(m.deadline);
        }
        address account = _requireAccountForSender(player);
        seat = m.turnSeat;
        if (_seats[matchId][seat].player != account) {
            revert NotYourTurn(account);
        }
    }

    /// @notice The seat `player` occupies, if it owes an answer to the open
    ///         query and is still in time.
    function _requireResponder(
        uint256 matchId,
        address player
    ) internal view returns (uint8 seat) {
        Match storage m = _matches[matchId];
        if (m.status != Status.Active) {
            revert NotActive(matchId);
        }
        if (block.timestamp > m.deadline) {
            revert DeadlinePassed(m.deadline);
        }
        address account = _requireAccountForSender(player);
        for (uint8 i = 0; i < SEATS; i++) {
            if (
                _seats[matchId][i].player == account &&
                (m.awaiting & (uint8(1) << i)) != 0
            ) {
                return i;
            }
        }
        revert NotAwaited(account);
    }

    function _spendActionPoints(uint256 matchId, uint8 amount) internal {
        Match storage m = _matches[matchId];
        if (m.actionPoints < amount) {
            revert NotEnoughActionPoints(m.actionPoints, amount);
        }
        m.actionPoints -= amount;
    }

    /// @notice Grant extra action points this turn (a room effect, say).
    function _grantActionPoints(uint256 matchId, uint8 amount) internal {
        _matches[matchId].actionPoints += amount;
    }

    /// @notice Make the turn wait for every seat in `seats` (a bitmask) to
    ///         answer. The game stores what was asked.
    function _openQuery(uint256 matchId, uint8 seats) internal {
        Match storage m = _matches[matchId];
        if (m.awaiting != 0) {
            revert QueryPending(matchId);
        }
        m.awaiting = seats;
        m.deadline = uint64(block.timestamp) + responseDuration;
        emit QueryOpened(matchId, seats, m.deadline);
    }

    /// @notice `seat` answered. Once all have, the turn holder's clock
    ///         restarts: the time spent waiting was not theirs.
    function _answered(uint256 matchId, uint8 seat) internal {
        Match storage m = _matches[matchId];
        m.awaiting &= ~(uint8(1) << seat);
        emit QueryAnswered(matchId, seat);
        if (m.awaiting == 0) {
            m.deadline = uint64(block.timestamp) + turnDuration;
        }
    }

    function _commitmentOf(
        uint256 matchId,
        uint8 seat
    ) internal view returns (bytes32) {
        return _seats[matchId][seat].commitment;
    }

    /// @notice Replace a seat's commitment. Only after verifying a proof that
    ///         the new one follows from the old.
    function _setCommitment(
        uint256 matchId,
        uint8 seat,
        bytes32 commitment
    ) internal {
        _requireFieldElement(commitment);
        _seats[matchId][seat].commitment = commitment;
        emit CommitmentUpdated(matchId, seat, commitment);
    }

    /// @notice End the match and credit the whole pot to `winner`.
    function _finish(uint256 matchId, uint8 winner, bool byTimeout) internal {
        Match storage m = _matches[matchId];
        m.status = Status.Finished;
        m.winner = winner;
        m.awaiting = 0;
        address player = _seats[matchId][winner].player;
        balanceOf[player] += uint256(m.stake) * SEATS;
        emit MatchFinished(matchId, winner, player, byTimeout);
    }

    /// @notice Call at the end of every action: once the turn holder has no
    ///         action points left, nothing is pending and the game has nothing
    ///         more owed in the turn ({_turnMayEnd}), the turn passes.
    function _settle(uint256 matchId) internal {
        Match storage m = _matches[matchId];
        if (
            m.status == Status.Active &&
            m.awaiting == 0 &&
            m.actionPoints == 0 &&
            _turnMayEnd(matchId)
        ) {
            _startTurn(matchId, _otherSeat(m.turnSeat));
        }
    }

    /// @notice Revert unless `proof` verifies against `publicInputs`. A
    ///         verifier that reverts on malformed input is treated the same as
    ///         one that returns false, so a game sees exactly one failure.
    function _verify(
        IZKVerifier verifier,
        bytes calldata proof,
        bytes32[] memory publicInputs
    ) internal view {
        try verifier.verify(proof, publicInputs) returns (bool ok) {
            if (!ok) {
                revert InvalidProof();
            }
        } catch {
            revert InvalidProof();
        }
    }

    // ------------------------------------------------------------------------
    // INTERNALS
    // ------------------------------------------------------------------------

    function _startTurn(uint256 matchId, uint8 seat) private {
        Match storage m = _matches[matchId];
        m.turnSeat = seat;
        m.actionPoints = _actionPointsAtTurnStart(matchId, seat);
        m.deadline = uint64(block.timestamp) + turnDuration;
        emit TurnStarted(matchId, seat, m.actionPoints, m.deadline);
    }

    function _otherSeat(uint8 seat) internal pure returns (uint8) {
        return seat == 0 ? 1 : 0;
    }

    function _requireFieldElement(bytes32 value) internal pure {
        if (uint256(value) >= FIELD_MODULUS) {
            revert NotAFieldElement(value);
        }
    }
}
