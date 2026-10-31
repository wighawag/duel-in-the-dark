// duel-in-the-dark's rules, as whole-state transitions.
//
// THE CIRCUIT IS THE RULES. Every action is a circuit taking the public match
// `State` before it and the `State` after it, both public, and proving that
// `next` is exactly what the action does to `state` given the actor's hidden
// state. Each circuit computes the expected next state itself and asserts it
// equals `next` field for field, so no field of `next` is free: for a given
// `state` and witness at most one `next` verifies. That is what lets a later
// state channel settle a dispute with a co-signed `State` and one proof, with
// no duel rule in Solidity.
//
// The contract builds `state` from its storage; only `next` comes from the
// player. See work:work/specs/accepted/milestone-c-noir-parity.md (duel's
// `work` branch) for the design.
pub mod ship;

use commitment::commit;
pub use ship::{can_move, can_shoot, is_room, ROOMS};

// phases of the turn (State.phase)
/// the actor spends action points or ends the turn
pub global PLAY: u8 = 0;
/// a shot at `arg_b` from `arg_a` awaits the other seat's proven answer
pub global SHOT: u8 = 1;
/// the shooter owes the free move out of `arg_a`
pub global MOVE_AFTER_SHOT: u8 = 2;
/// the actor's last action gave the other seat its last hit
pub global OVER: u8 = 3;

/// hits a seat can take; the one that takes this many loses
pub global LIVES: u8 = 2;

pub global MOVE_COST: u8 = 1;
pub global SHOOT_COST: u8 = 2;

/// A seat's hidden state. Only `room` is used in milestone C; `traps` and
/// `charge` (0 = none) are the slots milestone D fills, already part of the
/// commitment so that adding them changes no layout.
pub struct Hidden {
    pub room: u8,
    pub traps: [u8; 2],
    pub charge: u8,
}

impl Hidden {
    /// One byte per slot. Every slot is a u8, so this is injective without
    /// any bit decomposition: the circuit packs, it never unpacks.
    pub fn pack(self) -> Field {
        self.room as Field
            + 0x100 * (self.traps[0] as Field)
            + 0x10000 * (self.traps[1] as Field)
            + 0x1000000 * (self.charge as Field)
    }

    pub fn commit(self, salt: Field) -> Field {
        commit(self.pack(), salt)
    }
}

/// The public state of a match, as the contract stores it. In verifier
/// public-input order: commitments[0..2], hits[0..2], actor, ap, phase, arg_a,
/// arg_b, sealed.
pub struct State {
    pub commitments: [Field; 2],
    /// hits TAKEN by each seat
    pub hits: [u8; 2],
    /// the turn holder
    pub actor: u8,
    /// action points the turn holder has left
    pub ap: u8,
    pub phase: u8,
    /// pending-action data: in milestone C, the shooter's revealed room
    pub arg_a: u8,
    /// pending-action data: in milestone C, the room shot at
    pub arg_b: u8,
    /// the room sealed by Coolant Purge, 0 = none (milestone D; always 0 in C)
    pub sealed: u8,
}

impl Eq for State {
    fn eq(self, other: State) -> bool {
        (self.commitments == other.commitments)
            & (self.hits == other.hits)
            & (self.actor == other.actor)
            & (self.ap == other.ap)
            & (self.phase == other.phase)
            & (self.arg_a == other.arg_a)
            & (self.arg_b == other.arg_b)
            & (self.sealed == other.sealed)
    }
}

pub fn other(seat: u8) -> u8 {
    1 - seat
}

/// What every transition checks of the state it starts from.
pub fn assert_well_formed(state: State) {
    assert(state.actor < 2, "no such seat");
}

/// Assert that `hidden` (with `salt`) opens `seat`'s commitment in `state`.
pub fn assert_opens(state: State, seat: u8, hidden: Hidden, salt: Field) {
    assert(hidden.commit(salt) == state.commitments[seat as u32], "commitment does not match");
}

/// A valid starting state: in a room, no trap, no charge.
pub fn is_valid_start(hidden: Hidden) -> bool {
    is_room(hidden.room) & (hidden.traps == [0, 0]) & (hidden.charge == 0)
}

// ----------------------------------------------------------------------------
// THE ACTIONS: `state` + the actor's witness -> the one valid `next`
// ----------------------------------------------------------------------------

/// Move to an adjacent room, hidden: 1 AP in PLAY, free (and only out of the
/// revealed room) after a shot.
pub fn apply_move(state: State, hidden: Hidden, salt: Field, to: Hidden, new_salt: Field) -> State {
    assert_well_formed(state);
    assert_opens(state, state.actor, hidden, salt);
    assert(can_move(hidden.room, to.room), "not an adjacent room");
    assert(to.room != state.sealed, "the room is sealed");
    assert((to.traps == hidden.traps) & (to.charge == hidden.charge), "a move only moves");

    let mut next = state;
    next.commitments[state.actor as u32] = to.commit(new_salt);
    if state.phase == PLAY {
        assert(state.ap >= MOVE_COST, "not enough action points");
        next.ap = state.ap - MOVE_COST;
    } else {
        assert(state.phase == MOVE_AFTER_SHOT, "not a time to move");
        assert(hidden.room == state.arg_a, "must move out of the room it shot from");
        next.phase = PLAY;
        next.arg_a = 0;
        next.arg_b = 0;
    }
    next
}

/// Shoot into `target`, revealing the room shot from: 2 AP. The opponent
/// answers next (`apply_answer_shot`).
pub fn apply_shoot(state: State, hidden: Hidden, salt: Field, target: u8) -> State {
    assert_well_formed(state);
    assert(state.phase == PLAY, "not a time to shoot");
    assert(state.ap >= SHOOT_COST, "not enough action points");
    assert_opens(state, state.actor, hidden, salt);
    assert(can_shoot(hidden.room, target), "cannot shoot there from here");

    let mut next = state;
    next.ap = state.ap - SHOOT_COST;
    next.phase = SHOT;
    next.arg_a = hidden.room;
    next.arg_b = target;
    next
}

/// The shot's target answers, truthfully: the hit (or miss) follows from its
/// hidden room. The responder's commitment does not change.
pub fn apply_answer_shot(state: State, hidden: Hidden, salt: Field) -> State {
    assert_well_formed(state);
    assert(state.phase == SHOT, "no shot to answer");
    let responder = other(state.actor);
    assert_opens(state, responder, hidden, salt);

    let mut next = state;
    if hidden.room == state.arg_b {
        let hits = state.hits[responder as u32] + 1;
        next.hits[responder as u32] = hits;
        next.phase = if hits >= LIVES { OVER } else { MOVE_AFTER_SHOT };
    } else {
        next.phase = MOVE_AFTER_SHOT;
    }
    next
}

// ----------------------------------------------------------------------------
// TESTS (the circuits test their own cheating cases)
// ----------------------------------------------------------------------------

pub fn hidden(room: u8) -> Hidden {
    Hidden { room, traps: [0, 0], charge: 0 }
}

/// A match where seat 0 is in `a`, seat 1 in `b`, seat `actor` to play with 2 AP.
pub fn fresh(a: u8, b: u8, actor: u8) -> State {
    State {
        commitments: [hidden(a).commit(1), hidden(b).commit(2)],
        hits: [0, 0],
        actor,
        ap: 2,
        phase: PLAY,
        arg_a: 0,
        arg_b: 0,
        sealed: 0,
    }
}

#[test]
fn duel_commitment_is_stable() {
    // pinned: its twin in circuits/test/duel.test.ts must give the same value
    let h = Hidden { room: 3, traps: [4, 5], charge: 6 };
    assert(h.pack() == 0x06050403);
    assert(h.commit(12345) == 0x0494854f2d6dd4323e87abf5d8b9d079ca04042a20efdd7c7abadec059636e37);
}

#[test]
fn a_whole_shot_miss() {
    let s = fresh(1, 8, 0);
    let shot = apply_shoot(s, hidden(1), 1, 2);
    assert((shot.phase == SHOT) & (shot.ap == 0) & (shot.arg_a == 1) & (shot.arg_b == 2));
    let answered = apply_answer_shot(shot, hidden(8), 2);
    assert((answered.phase == MOVE_AFTER_SHOT) & (answered.hits == [0, 0]));
    let moved = apply_move(answered, hidden(1), 1, hidden(5), 9);
    assert((moved.phase == PLAY) & (moved.ap == 0) & (moved.arg_a == 0));
    assert(moved.commitments[0] == hidden(5).commit(9));
    assert(moved.commitments[1] == s.commitments[1]);
}

#[test]
fn a_second_hit_ends_it() {
    let mut s = fresh(4, 7, 0);
    s.hits = [0, 1];
    let answered = apply_answer_shot(apply_shoot(s, hidden(4), 1, 7), hidden(7), 2);
    assert((answered.phase == OVER) & (answered.hits == [0, 2]));
}
