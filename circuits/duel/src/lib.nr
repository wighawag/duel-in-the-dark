// duel-in-the-dark's rules, as whole-state transitions.
//
// THE CIRCUIT IS THE RULES. Every action is a circuit taking the public match
// `State` before it and the `State` after it, both public, and proving that
// `next` is exactly what the action does to `state` given the prover's hidden
// state. Each circuit computes the expected next state itself and asserts it
// equals `next` field for field, so no field of `next` is free: for a given
// `state` and witness at most one `next` verifies. That is what lets a later
// state channel settle a dispute with a co-signed `State` and one proof, with
// no duel rule in Solidity.
//
// The contract builds `state` from its storage; only `next` comes from the
// player. The design is on duel's `work` branch:
// work/specs/accepted/milestone-c-noir-parity.md, then
// work/specs/accepted/milestone-d-full-card-game.md.
pub mod ship;

use commitment::commit;
pub use ship::{can_move, can_shoot, is_room, ROOMS};

// ----------------------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------------------

// phases (State.phase). From QUERY up, the OTHER seat must answer: that is the
// one fact about phases the contract knows.
/// the actor spends action points or ends the turn
pub global PLAY: u8 = 0;
/// the shooter owes the free move out of `arg_a`
pub global MOVE_AFTER_SHOT: u8 = 1;
/// the actor's last action gave the other seat its last hit
pub global OVER: u8 = 2;
pub global QUERY: u8 = 16;
/// hit if in `arg_b` (shot from `arg_a`)
pub global SHOT: u8 = 16;
/// name a room adjacent to yours
pub global LISTEN: u8 = 17;
/// hit if in `arg_b` (a trap)
pub global DETONATION: u8 = 18;
/// hit if in `arg_b` (the Remote Charge)
pub global CHARGE: u8 = 19;
/// hit if in the Engine Room, then move out
pub global PURGE: u8 = 20;
/// if in the Galley, drop to the Engine Room; if it is sealed, hit and move out
pub global CHUTE: u8 = 21;
/// on the upper deck: name your room; else as LISTEN
pub global TRACKER: u8 = 22;

// actions (State.last: what produced this state)
pub global NONE: u8 = 0;
pub global MOVE: u8 = 1;
pub global FORCED_MOVE: u8 = 2;
pub global DROP_DOWN: u8 = 3;
pub global SHOOT: u8 = 4;
pub global LISTEN_ACTION: u8 = 5;
pub global SET_TRAP: u8 = 6;
pub global DETONATE: u8 = 7;
pub global SET_CHARGE: u8 = 8;
pub global FIRE_CHARGE: u8 = 9;
pub global COOLANT_PURGE: u8 = 10;
pub global MAINTENANCE_CHUTE: u8 = 11;
pub global STIM_RATIONS: u8 = 12;
pub global MOTION_TRACKER: u8 = 13;
pub global ANSWER: u8 = 14;

// the rooms whose effects the rules name
pub global CRYO_BAY: u8 = 1;
pub global SCIENCE_LAB: u8 = 3;
pub global GANTRY: u8 = 4;
pub global GALLEY: u8 = 5;
pub global CARGO_HOLD: u8 = 7;
pub global ENGINE_ROOM: u8 = 8;
/// rooms 1..UPPER_DECK are the upper deck
pub global UPPER_DECK: u8 = 4;

/// hits a seat can take; the one that takes this many loses
pub global LIVES: u8 = 2;

pub global MOVE_COST: u8 = 1;
pub global SHOOT_COST: u8 = 2;
/// Listen, a trap, a Remote Charge, Coolant Purge, Maintenance Chute
pub global ACTION_COST: u8 = 1;

// ----------------------------------------------------------------------------
// STATE
// ----------------------------------------------------------------------------

/// A seat's hidden state: its room, the rooms of its traps (at most two, in
/// two different rooms) and of its Remote Charge, 0 = none.
#[derive(Eq)]
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

/// The public state of a match, as the contract stores it, in verifier
/// public-input order.
pub struct State {
    pub commitments: [Field; 2],
    /// hits TAKEN by each seat
    pub hits: [u8; 2],
    /// the turn holder
    pub actor: u8,
    /// action points the turn holder has left
    pub ap: u8,
    pub phase: u8,
    /// the public data of the last action or of the pending query
    pub arg_a: u8,
    pub arg_b: u8,
    /// the room a Coolant Purge sealed, 0 = none; in force only while
    /// `seal_active`, since nothing clears it when a turn passes
    pub sealed: u8,
    /// the turn number (ZKMatches counts them from 1). The four turn fields are
    /// Fields, not integers: the rules only compare them for equality, and an
    /// integer would cost a range check that is most of a circuit.
    pub turn: Field,
    /// the turn in which the turn holder last took an action of its own (a
    /// Remote Charge going off does not count)
    pub acted: Field,
    /// the turn `sealed` was set in
    pub sealed_turn: Field,
    /// the turn the Motion Tracker was last used in
    pub tracked: Field,
    /// bit s set while seat s has a Remote Charge set
    pub armed: u8,
    /// the action that produced this state
    pub last: u8,
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
            & (self.turn == other.turn)
            & (self.acted == other.acted)
            & (self.sealed_turn == other.sealed_turn)
            & (self.tracked == other.tracked)
            & (self.armed == other.armed)
            & (self.last == other.last)
    }
}

pub fn other(seat: u8) -> u8 {
    1 - seat
}

// ----------------------------------------------------------------------------
// PREDICATES on the public state (circuits/src/duel.ts mirrors them)
// ----------------------------------------------------------------------------

/// The turn holder has not acted yet this turn.
pub fn fresh_turn(s: State) -> bool {
    s.acted != s.turn
}

/// A seal lasts the rest of the purger's turn and the opponent's whole next
/// turn. (Field arithmetic: no overflow to reason about.)
pub fn seal_active(s: State) -> bool {
    (s.sealed != 0) & ((s.turn == s.sealed_turn) | (s.turn as Field == s.sealed_turn as Field + 1))
}

pub fn room_sealed(s: State, room: u8) -> bool {
    seal_active(s) & (s.sealed == room)
}

/// The `armed` bit of `seat`. Arithmetic, not bitwise: `armed` is 0..3, and
/// bitwise operators would bring their lookup tables into every circuit.
pub fn armed(s: State, seat: u8) -> bool {
    if seat == 0 {
        (s.armed == 1) | (s.armed == 3)
    } else {
        s.armed >= 2
    }
}

fn bit(seat: u8) -> u8 {
    if seat == 0 {
        1
    } else {
        2
    }
}

/// The turn holder's Remote Charge must go off before anything else.
pub fn charge_due(s: State) -> bool {
    armed(s, s.actor) & fresh_turn(s)
}

// ----------------------------------------------------------------------------
// SHARED CHECKS
// ----------------------------------------------------------------------------

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

/// The start of every action the turn holder takes of its own: nothing else
/// may happen while its Remote Charge is due; the action is recorded as taken
/// this turn; its public data replaces the last action's.
fn own_action(state: State, action: u8) -> State {
    assert_well_formed(state);
    assert(!charge_due(state), "the Remote Charge goes off first");
    let mut next = state;
    next.acted = state.turn;
    next.last = action;
    next.arg_a = 0;
    next.arg_b = 0;
    next
}

fn pay(state: State, cost: u8) -> u8 {
    assert(state.ap >= cost, "not enough action points");
    state.ap - cost
}

fn assert_play(state: State) {
    assert(state.phase == PLAY, "not a time to act");
}

// ----------------------------------------------------------------------------
// THE ACTIONS: `state` + the prover's witness -> the one valid `next`
// ----------------------------------------------------------------------------

/// MOVE (1 AP, to an adjacent room), FORCED_MOVE (free, out of the room a shot
/// revealed) or DROP_DOWN (free, Gantry to Galley, revealing both). Never into
/// a sealed room.
pub fn apply_move(
    state: State,
    hidden: Hidden,
    salt: Field,
    to: Hidden,
    new_salt: Field,
    action: u8,
) -> State {
    let mut next = own_action(state, action);
    assert_opens(state, state.actor, hidden, salt);
    assert((to.traps == hidden.traps) & (to.charge == hidden.charge), "a move only moves");
    assert(!room_sealed(state, to.room), "the room is sealed");
    next.commitments[state.actor as u32] = to.commit(new_salt);
    if action == MOVE {
        assert_play(state);
        assert(can_move(hidden.room, to.room), "not an adjacent room");
        next.ap = pay(state, MOVE_COST);
    } else if action == FORCED_MOVE {
        assert(state.phase == MOVE_AFTER_SHOT, "no move is owed");
        assert(hidden.room == state.arg_a, "must move out of the room it shot from");
        assert(can_move(hidden.room, to.room), "not an adjacent room");
        next.phase = PLAY;
    } else {
        assert(action == DROP_DOWN, "not a move");
        assert_play(state);
        assert(hidden.room == GANTRY, "not on the Observation Gantry");
        assert(to.room == GALLEY, "the drop lands in the Galley");
        next.arg_a = GANTRY;
        next.arg_b = GALLEY;
    }
    next
}

/// Shoot into `target`, revealing the room shot from: 2 AP. The opponent
/// answers next, then the shooter owes a free move.
pub fn apply_shoot(state: State, hidden: Hidden, salt: Field, target: u8) -> State {
    let mut next = own_action(state, SHOOT);
    assert(state.phase == PLAY, "not a time to shoot");
    next.ap = pay(state, SHOOT_COST);
    assert_opens(state, state.actor, hidden, salt);
    assert(can_shoot(hidden.room, target), "cannot shoot there from here");
    next.phase = SHOT;
    next.arg_a = hidden.room;
    next.arg_b = target;
    next
}

/// What changes the actor's traps or charge: SET_TRAP (1 AP, in the current
/// room; with two set, `room` names the one it replaces), DETONATE (1 AP,
/// `room` is the trap's), SET_CHARGE (1 AP, from the Engine Room, `room` is
/// the target) and FIRE_CHARGE (free, forced at the start of the setter's
/// next turn). The actor's room never changes.
pub fn apply_trap(
    state: State,
    hidden: Hidden,
    salt: Field,
    new_hidden: Hidden,
    new_salt: Field,
    action: u8,
    room: u8,
) -> State {
    assert_well_formed(state);
    assert_play(state);
    assert_opens(state, state.actor, hidden, salt);
    let mut next = state;
    let mut expected = hidden;
    if action == FIRE_CHARGE {
        // The one action a due charge allows, and not one of the actor's own:
        // `acted` stays, so Stim Rations can still be claimed after it.
        assert(charge_due(state), "the Remote Charge is not due");
        assert(hidden.charge != 0, "no Remote Charge set");
        expected.charge = 0;
        next.armed = state.armed - bit(state.actor);
        next.phase = CHARGE;
        next.last = FIRE_CHARGE;
        next.arg_a = 0;
        next.arg_b = hidden.charge;
    } else {
        next = own_action(state, action);
        next.ap = pay(state, ACTION_COST);
        let here = hidden.room;
        let a = hidden.traps[0];
        let b = hidden.traps[1];
        if action == SET_TRAP {
            assert((a != here) & (b != here), "already a trap here");
            if a == 0 {
                expected.traps = [here, b];
            } else if b == 0 {
                expected.traps = [a, here];
            } else if room == a {
                expected.traps = [here, b];
            } else {
                assert(room == b, "no such trap to replace");
                expected.traps = [a, here];
            }
        } else if action == DETONATE {
            assert(room != 0, "no trap there");
            if room == a {
                expected.traps = [0, b];
            } else {
                assert(room == b, "no trap there");
                expected.traps = [a, 0];
            }
            next.phase = DETONATION;
            next.arg_b = room;
        } else {
            assert(action == SET_CHARGE, "not a trap action");
            assert(here == ENGINE_ROOM, "not in the Engine Room");
            assert(
                (hidden.charge == 0) & !armed(state, state.actor),
                "a Remote Charge is already set",
            );
            assert(is_room(room) & (room != ENGINE_ROOM), "not a room for the charge");
            expected.charge = room;
            next.armed = state.armed + bit(state.actor);
            next.arg_a = ENGINE_ROOM;
        }
    }
    assert(new_hidden == expected, "not this trap action");
    next.commitments[state.actor as u32] = new_hidden.commit(new_salt);
    next
}

/// What the actor does without changing its hidden state: LISTEN (1 AP, no
/// secret involved), and the room effects that reveal its room: COOLANT_PURGE
/// (1 AP, Cryo Bay), MAINTENANCE_CHUTE (1 AP, Science Lab), STIM_RATIONS
/// (free, +1 AP, in the Galley before any other own action this turn),
/// MOTION_TRACKER (free, Cargo Hold, once per turn).
pub fn apply_effect(state: State, hidden: Hidden, salt: Field, action: u8) -> State {
    let mut next = own_action(state, action);
    assert_play(state);
    if action == LISTEN_ACTION {
        next.ap = pay(state, ACTION_COST);
        next.phase = LISTEN;
    } else {
        assert_opens(state, state.actor, hidden, salt);
        let here = hidden.room;
        next.arg_a = here;
        if action == COOLANT_PURGE {
            assert(here == CRYO_BAY, "not in the Cryo Bay");
            next.ap = pay(state, ACTION_COST);
            next.sealed = ENGINE_ROOM;
            next.sealed_turn = state.turn;
            next.phase = PURGE;
            next.arg_b = ENGINE_ROOM;
        } else if action == MAINTENANCE_CHUTE {
            assert(here == SCIENCE_LAB, "not in the Science Lab");
            next.ap = pay(state, ACTION_COST);
            next.phase = CHUTE;
            next.arg_b = GALLEY;
        } else if action == STIM_RATIONS {
            assert(here == GALLEY, "not in the Galley");
            assert(fresh_turn(state), "only at the start of the turn");
            next.ap = state.ap + 1;
        } else {
            assert(action == MOTION_TRACKER, "not an effect");
            assert(here == CARGO_HOLD, "not in the Cargo Hold");
            assert(state.tracked != state.turn, "once per turn");
            next.tracked = state.turn;
            next.phase = TRACKER;
        }
    }
    next
}

/// The other seat answers the pending query, truthfully: whatever it reveals
/// or suffers follows from its hidden room. When a hit forces it to move, the
/// move is in this same proof (`new_hidden`), hidden. `reveal` is the room a
/// listen names. Its traps and charge are never touched.
pub fn apply_answer(
    state: State,
    hidden: Hidden,
    salt: Field,
    new_hidden: Hidden,
    new_salt: Field,
    reveal: u8,
) -> State {
    assert_well_formed(state);
    let q = state.phase;
    assert((q >= QUERY) & (q <= TRACKER), "no query to answer");
    let responder = other(state.actor);
    assert_opens(state, responder, hidden, salt);
    assert(
        (new_hidden.traps == hidden.traps) & (new_hidden.charge == hidden.charge),
        "an answer only moves",
    );
    let room = hidden.room;
    let mut next = state;
    next.last = ANSWER;
    next.phase = PLAY;
    let mut hit = false;
    if (q == SHOT) | (q == DETONATION) | (q == CHARGE) {
        hit = room == state.arg_b;
        if q == SHOT {
            next.phase = MOVE_AFTER_SHOT;
        }
    } else if q == PURGE {
        hit = room == ENGINE_ROOM;
        if hit {
            next.commitments[responder as u32] = forced_out(state, new_hidden, new_salt);
        }
    } else if q == CHUTE {
        // Always a new commitment, so a silent drop looks like nothing at all.
        let dropped = room == GALLEY;
        hit = dropped & room_sealed(state, ENGINE_ROOM);
        if hit {
            next.commitments[responder as u32] = forced_out(state, new_hidden, new_salt);
        } else {
            let lands = if dropped { ENGINE_ROOM } else { room };
            assert(new_hidden.room == lands, "not where the chute leaves you");
            next.commitments[responder as u32] = new_hidden.commit(new_salt);
        }
    } else {
        let exact = (q == TRACKER) & (room <= UPPER_DECK);
        if exact {
            assert(reveal == room, "the tracker finds you");
        } else {
            assert(can_move(room, reveal), "not a room next to yours");
        }
        next.arg_a = exact as u8;
        next.arg_b = reveal;
    }
    if hit {
        let hits = state.hits[responder as u32] + 1;
        next.hits[responder as u32] = hits;
        if hits >= LIVES {
            next.phase = OVER;
        }
    }
    next
}

/// Hit in the Engine Room: move out of it, hidden, never into a sealed room.
fn forced_out(state: State, to: Hidden, salt: Field) -> Field {
    assert(can_move(ENGINE_ROOM, to.room), "must move out of the Engine Room");
    assert(!room_sealed(state, to.room), "the room is sealed");
    to.commit(salt)
}

// ----------------------------------------------------------------------------
// TEST HELPERS (the circuits test their own cheating cases)
// ----------------------------------------------------------------------------

pub fn hidden(room: u8) -> Hidden {
    Hidden { room, traps: [0, 0], charge: 0 }
}

/// A match on its first turn: seat 0 in `a` (salt 1), seat 1 in `b` (salt 2),
/// seat `actor` to play with 2 AP.
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
        turn: 1,
        acted: 0,
        sealed_turn: 0,
        tracked: 0,
        armed: 0,
        last: NONE,
    }
}

/// What ZKMatches does when the turn passes: the other seat, 2 AP, turn + 1.
pub fn pass_turn(s: State) -> State {
    let mut n = s;
    n.actor = other(s.actor);
    n.ap = 2;
    n.turn = s.turn + 1;
    n
}

/// `s` with seat `seat`'s commitment replaced.
pub fn with_commitment(s: State, seat: u8, h: Hidden, salt: Field) -> State {
    let mut n = s;
    n.commitments[seat as u32] = h.commit(salt);
    n
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
    assert((shot.acted == 1) & (shot.last == SHOOT));
    let answered = apply_answer(shot, hidden(8), 2, hidden(8), 0, 0);
    assert((answered.phase == MOVE_AFTER_SHOT) & (answered.hits == [0, 0]));
    assert((answered.last == ANSWER) & (answered.commitments == s.commitments));
    let moved = apply_move(answered, hidden(1), 1, hidden(5), 9, FORCED_MOVE);
    assert((moved.phase == PLAY) & (moved.ap == 0) & (moved.arg_a == 0));
    assert(moved.commitments[0] == hidden(5).commit(9));
    assert(moved.commitments[1] == s.commitments[1]);
}

#[test]
fn a_second_hit_ends_it() {
    let mut s = fresh(4, 7, 0);
    s.hits = [0, 1];
    let answered = apply_answer(
        apply_shoot(s, hidden(4), 1, 7),
        hidden(7),
        2,
        hidden(7),
        0,
        0,
    );
    assert((answered.phase == OVER) & (answered.hits == [0, 2]));
}

#[test]
fn a_purge_seals_the_engine_room_until_the_purgers_next_turn() {
    // seat 0 purges from the Cryo Bay; seat 1 is in the Galley: no hit
    let s = fresh(1, 5, 0);
    let purged = apply_effect(s, hidden(1), 1, COOLANT_PURGE);
    assert((purged.sealed == 8) & (purged.sealed_turn == 1) & (purged.phase == PURGE));
    let p = apply_answer(purged, hidden(5), 2, hidden(5), 0, 0);
    assert((p.hits == [0, 0]) & (p.phase == PLAY) & room_sealed(p, 8));
    // in force through seat 1's turn, gone when seat 0's next turn starts
    let t2 = pass_turn(p);
    assert(room_sealed(t2, 8) & !room_sealed(t2, 7));
    assert(!seal_active(pass_turn(t2)));
}

#[test]
fn a_chute_into_a_sealed_engine_room_hits() {
    // seat 0 in the Science Lab, seat 1 in the Galley, the Engine Room sealed
    // last turn by seat 1 (still in force this turn)
    let mut s = fresh(3, 5, 0);
    s.turn = 2;
    s.sealed = 8;
    s.sealed_turn = 1;
    let chute = apply_effect(s, hidden(3), 1, MAINTENANCE_CHUTE);
    assert((chute.phase == CHUTE) & (chute.arg_a == 3) & (chute.arg_b == 5));
    let a = apply_answer(chute, hidden(5), 2, hidden(6), 7, 0);
    assert((a.hits == [0, 1]) & (a.commitments[1] == hidden(6).commit(7)));
}

#[test]
fn a_charge_goes_off_first_then_stim_rations() {
    // seat 0, in the Engine Room, sets a charge into the Mess Hall
    let s = fresh(8, 6, 0);
    let charged = Hidden { room: 8, traps: [0, 0], charge: 6 };
    let set = apply_trap(s, hidden(8), 1, charged, 3, SET_CHARGE, 6);
    assert((set.armed == 1) & (set.ap == 1) & (set.arg_a == 8) & (set.arg_b == 0));
    assert(!charge_due(set));
    // seat 0 walks to the Galley (turn 1), seat 1 passes (turn 2)...
    let in_galley = Hidden { room: 5, traps: [0, 0], charge: 6 };
    let t3 = with_commitment(pass_turn(pass_turn(set)), 0, in_galley, 4);
    // ...and on turn 3 the charge goes off before anything else
    assert(charge_due(t3));
    let fired = apply_trap(t3, in_galley, 4, hidden(5), 5, FIRE_CHARGE, 0);
    assert((fired.phase == CHARGE) & (fired.arg_b == 6) & (fired.armed == 0) & (fired.ap == 2));
    assert(fresh_turn(fired) & (fired.last == FIRE_CHARGE));
    let a = apply_answer(fired, hidden(6), 2, hidden(6), 0, 0);
    assert((a.hits == [0, 1]) & (a.phase == PLAY));
    // the turn still started in the Galley
    let stim = apply_effect(a, hidden(5), 5, STIM_RATIONS);
    assert((stim.ap == 3) & (stim.arg_a == 5) & !fresh_turn(stim));
}
