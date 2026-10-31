// ANSWER: the other seat answers the pending query, truthfully; whatever it
// reveals or suffers follows from its hidden room, so it cannot lie. A shot, a
// detonation or a Remote Charge: hit or miss. A Coolant Purge: hit if in the
// Engine Room, then a forced move out, hidden, in this same proof. A
// Maintenance Chute: from the Galley down to the Engine Room, silently (the
// commitment is always replaced), and if it is sealed, a hit and a move out.
// A listen: a room next to its own (`reveal`), its choice. A Motion Tracker: a
// listen, but its exact room if on the upper deck.
use duel::{
    ANSWER, apply_answer, apply_shoot, CHARGE, CHUTE, DETONATION, fresh, Hidden, hidden, LISTEN,
    MOVE_AFTER_SHOT, OVER, PLAY, PURGE, State, TRACKER,
};

fn main(
    state: pub State,
    next: pub State,
    hidden_state: Hidden,
    salt: Field,
    new_hidden: Hidden,
    new_salt: Field,
    reveal: u8,
) {
    assert(
        apply_answer(state, hidden_state, salt, new_hidden, new_salt, reveal) == next,
        "next is not the answer",
    );
}

/// Seat 0 (in `a`, salt 1) asked `phase` with `arg_a`, `arg_b`; seat 1 is in
/// `b` (salt 2) and answers.
fn asked(a: u8, b: u8, phase: u8, arg_a: u8, arg_b: u8) -> State {
    let mut s = fresh(a, b, 0);
    s.phase = phase;
    s.arg_a = arg_a;
    s.arg_b = arg_b;
    s.acted = 1;
    s.last = 7;
    s
}

fn answered(s: State, hits: [u8; 2], phase: u8) -> State {
    let mut n = s;
    n.hits = hits;
    n.phase = phase;
    n.last = ANSWER;
    n
}

/// `answered`, with seat 1 now behind `h` (salt 9).
fn moved(s: State, hits: [u8; 2], h: Hidden) -> State {
    let mut n = answered(s, hits, PLAY);
    n.commitments[1] = h.commit(9);
    n
}

// --- shots (as in milestone C) ----------------------------------------------

#[test]
fn a_hit_is_a_hit() {
    let s = apply_shoot(fresh(2, 3, 0), hidden(2), 1, 3);
    main(
        s,
        answered(s, [0, 1], MOVE_AFTER_SHOT),
        hidden(3),
        2,
        hidden(3),
        0,
        0,
    );
}

#[test]
fn a_miss_is_a_miss() {
    let s = apply_shoot(fresh(2, 3, 0), hidden(2), 1, 4);
    main(
        s,
        answered(s, [0, 0], MOVE_AFTER_SHOT),
        hidden(3),
        2,
        hidden(3),
        0,
        0,
    );
}

#[test]
fn seat_one_shooting_seat_zero() {
    let s = apply_shoot(fresh(2, 3, 1), hidden(3), 2, 2);
    main(
        s,
        answered(s, [1, 0], MOVE_AFTER_SHOT),
        hidden(2),
        1,
        hidden(2),
        0,
        0,
    );
}

#[test]
fn the_second_hit_is_over() {
    let mut s = fresh(2, 3, 0);
    s.hits = [1, 1];
    let s = apply_shoot(s, hidden(2), 1, 3);
    main(s, answered(s, [1, 2], OVER), hidden(3), 2, hidden(3), 0, 0);
}

#[test(should_fail_with = "next is not the answer")]
fn cannot_deny_a_hit() {
    let s = apply_shoot(fresh(2, 3, 0), hidden(2), 1, 3);
    main(
        s,
        answered(s, [0, 0], MOVE_AFTER_SHOT),
        hidden(3),
        2,
        hidden(3),
        0,
        0,
    );
}

#[test(should_fail_with = "next is not the answer")]
fn cannot_claim_a_false_hit() {
    let s = apply_shoot(fresh(2, 3, 0), hidden(2), 1, 4);
    main(
        s,
        answered(s, [0, 1], MOVE_AFTER_SHOT),
        hidden(3),
        2,
        hidden(3),
        0,
        0,
    );
}

#[test(should_fail_with = "next is not the answer")]
fn cannot_slip_away_after_a_shot() {
    let s = apply_shoot(fresh(2, 3, 0), hidden(2), 1, 3);
    let mut n = answered(s, [0, 1], MOVE_AFTER_SHOT);
    n.commitments[1] = hidden(2).commit(9);
    main(s, n, hidden(3), 2, hidden(2), 9, 0);
}

#[test(should_fail_with = "commitment does not match")]
fn cannot_answer_from_another_room() {
    let s = apply_shoot(fresh(2, 3, 0), hidden(2), 1, 3);
    main(
        s,
        answered(s, [0, 0], MOVE_AFTER_SHOT),
        hidden(4),
        2,
        hidden(4),
        0,
        0,
    );
}

#[test(should_fail_with = "commitment does not match")]
fn the_shooter_cannot_answer() {
    let s = apply_shoot(fresh(2, 3, 0), hidden(2), 1, 3);
    main(
        s,
        answered(s, [0, 0], MOVE_AFTER_SHOT),
        hidden(2),
        1,
        hidden(2),
        0,
        0,
    );
}

#[test(should_fail_with = "no query to answer")]
fn nothing_to_answer() {
    let s = fresh(2, 3, 0);
    main(s, s, hidden(3), 2, hidden(3), 0, 0);
}

#[test(should_fail_with = "no query to answer")]
fn a_forced_move_is_not_a_query() {
    let s = asked(2, 3, MOVE_AFTER_SHOT, 2, 3);
    main(s, s, hidden(3), 2, hidden(3), 0, 0);
}

#[test(should_fail_with = "no query to answer")]
fn no_such_query() {
    let s = asked(2, 3, 23, 0, 0);
    main(s, s, hidden(3), 2, hidden(3), 0, 0);
}

#[test(should_fail_with = "an answer only moves")]
fn an_answer_cannot_touch_traps() {
    let s = asked(2, 3, DETONATION, 0, 3);
    main(
        s,
        answered(s, [0, 1], PLAY),
        hidden(3),
        2,
        Hidden { room: 3, traps: [0, 0], charge: 1 },
        0,
        0,
    );
}

// --- a trap, the Remote Charge ----------------------------------------------

#[test]
fn a_detonation_hits_or_misses_and_play_goes_on() {
    let s = asked(2, 3, DETONATION, 0, 3);
    main(s, answered(s, [0, 1], PLAY), hidden(3), 2, hidden(3), 0, 0);
    let s = asked(2, 3, DETONATION, 0, 4);
    main(s, answered(s, [0, 0], PLAY), hidden(3), 2, hidden(3), 0, 0);
}

#[test]
fn a_charge_hits_or_misses() {
    let s = asked(2, 6, CHARGE, 0, 6);
    main(s, answered(s, [0, 1], PLAY), hidden(6), 2, hidden(6), 0, 0);
    let s = asked(2, 6, CHARGE, 0, 5);
    main(s, answered(s, [0, 0], PLAY), hidden(6), 2, hidden(6), 0, 0);
}

#[test]
fn a_trap_can_end_it() {
    let mut s = asked(2, 3, DETONATION, 0, 3);
    s.hits = [0, 1];
    main(s, answered(s, [0, 2], OVER), hidden(3), 2, hidden(3), 0, 0);
}

#[test(should_fail_with = "next is not the answer")]
fn cannot_deny_a_trap() {
    let s = asked(2, 3, DETONATION, 0, 3);
    main(s, answered(s, [0, 0], PLAY), hidden(3), 2, hidden(3), 0, 0);
}

#[test(should_fail_with = "next is not the answer")]
fn a_trap_does_not_owe_a_move() {
    let s = asked(2, 3, DETONATION, 0, 4);
    main(
        s,
        answered(s, [0, 0], MOVE_AFTER_SHOT),
        hidden(3),
        2,
        hidden(3),
        0,
        0,
    );
}

// --- Coolant Purge ----------------------------------------------------------

fn purged(a: u8, b: u8) -> State {
    let mut s = asked(a, b, PURGE, 1, 8);
    s.sealed = 8;
    s.sealed_turn = 1;
    s
}

#[test]
fn a_purge_hits_and_forces_a_hidden_move_out() {
    let s = purged(1, 8);
    for to in [3, 6, 7] {
        main(
            s,
            moved(s, [0, 1], hidden(to)),
            hidden(8),
            2,
            hidden(to),
            9,
            0,
        );
    }
}

#[test]
fn a_purge_misses_and_nothing_changes() {
    let s = purged(1, 6);
    main(s, answered(s, [0, 0], PLAY), hidden(6), 2, hidden(6), 0, 0);
}

#[test(should_fail_with = "must move out of the Engine Room")]
fn a_purge_victim_cannot_stay() {
    let s = purged(1, 8);
    main(
        s,
        moved(s, [0, 1], hidden(8)),
        hidden(8),
        2,
        hidden(8),
        9,
        0,
    );
}

#[test(should_fail_with = "must move out of the Engine Room")]
fn a_purge_victim_cannot_jump() {
    let s = purged(1, 8);
    main(
        s,
        moved(s, [0, 1], hidden(5)),
        hidden(8),
        2,
        hidden(5),
        9,
        0,
    );
}

#[test(should_fail_with = "next is not the answer")]
fn cannot_deny_a_purge() {
    let s = purged(1, 8);
    main(s, answered(s, [0, 0], PLAY), hidden(8), 2, hidden(7), 9, 0);
}

#[test(should_fail_with = "next is not the answer")]
fn a_purge_miss_does_not_move() {
    let s = purged(1, 6);
    main(
        s,
        moved(s, [0, 0], hidden(7)),
        hidden(6),
        2,
        hidden(7),
        9,
        0,
    );
}

// --- Maintenance Chute ------------------------------------------------------

fn chuted(b: u8) -> State {
    asked(3, b, CHUTE, 3, 5)
}

#[test]
fn the_chute_drops_the_galley_into_the_engine_room_silently() {
    let s = chuted(5);
    main(
        s,
        moved(s, [0, 0], hidden(8)),
        hidden(5),
        2,
        hidden(8),
        9,
        0,
    );
}

#[test]
fn elsewhere_the_chute_changes_nothing_but_looks_the_same() {
    let s = chuted(6);
    main(
        s,
        moved(s, [0, 0], hidden(6)),
        hidden(6),
        2,
        hidden(6),
        9,
        0,
    );
}

#[test]
fn into_a_sealed_engine_room_it_hits_and_moves_on() {
    let mut s = chuted(5);
    s.sealed = 8;
    s.sealed_turn = 0;
    s.turn = 1;
    main(
        s,
        moved(s, [0, 1], hidden(7)),
        hidden(5),
        2,
        hidden(7),
        9,
        0,
    );
}

#[test]
fn an_expired_seal_does_not_hit() {
    let mut s = chuted(5);
    s.sealed = 8;
    s.sealed_turn = 1;
    s.turn = 3;
    main(
        s,
        moved(s, [0, 0], hidden(8)),
        hidden(5),
        2,
        hidden(8),
        9,
        0,
    );
}

#[test(should_fail_with = "not where the chute leaves you")]
fn the_galley_cannot_dodge_the_chute() {
    let s = chuted(5);
    main(
        s,
        moved(s, [0, 0], hidden(6)),
        hidden(5),
        2,
        hidden(6),
        9,
        0,
    );
}

#[test(should_fail_with = "not where the chute leaves you")]
fn the_chute_does_not_move_anyone_else() {
    let s = chuted(6);
    main(
        s,
        moved(s, [0, 0], hidden(8)),
        hidden(6),
        2,
        hidden(8),
        9,
        0,
    );
}

#[test(should_fail_with = "next is not the answer")]
fn the_chute_always_renews_the_commitment() {
    let s = chuted(6);
    main(s, answered(s, [0, 0], PLAY), hidden(6), 2, hidden(6), 9, 0);
}

#[test(should_fail_with = "must move out of the Engine Room")]
fn into_a_sealed_engine_room_it_must_move_on() {
    let mut s = chuted(5);
    s.sealed = 8;
    s.sealed_turn = 1;
    main(
        s,
        moved(s, [0, 1], hidden(8)),
        hidden(5),
        2,
        hidden(8),
        9,
        0,
    );
}

// --- Listen, Motion Tracker -------------------------------------------------

fn heard(s: State, exact: u8, room: u8) -> State {
    let mut n = answered(s, [0, 0], PLAY);
    n.arg_a = exact;
    n.arg_b = room;
    n
}

#[test]
fn a_listen_names_any_room_next_to_yours() {
    let s = asked(2, 7, LISTEN, 0, 0);
    for room in [4, 8, 5, 6] {
        main(s, heard(s, 0, room), hidden(7), 2, hidden(7), 0, room);
    }
}

#[test(should_fail_with = "not a room next to yours")]
fn a_listen_cannot_name_your_own_room() {
    let s = asked(2, 7, LISTEN, 0, 0);
    main(s, heard(s, 0, 7), hidden(7), 2, hidden(7), 0, 7);
}

#[test(should_fail_with = "not a room next to yours")]
fn a_listen_cannot_mislead() {
    let s = asked(2, 7, LISTEN, 0, 0);
    main(s, heard(s, 0, 1), hidden(7), 2, hidden(7), 0, 1);
}

#[test(should_fail_with = "not a room next to yours")]
fn the_drop_down_is_not_next_to_the_gantry() {
    let s = asked(2, 4, LISTEN, 0, 0);
    main(s, heard(s, 0, 5), hidden(4), 2, hidden(4), 0, 5);
}

#[test(should_fail_with = "next is not the answer")]
fn a_listen_does_not_move_you() {
    let s = asked(2, 7, LISTEN, 0, 0);
    let mut n = heard(s, 0, 8);
    n.commitments[1] = hidden(8).commit(9);
    main(s, n, hidden(7), 2, hidden(8), 9, 8);
}

#[test]
fn the_tracker_finds_the_upper_deck_exactly() {
    for room in 1..5 {
        let s = asked(7, room, TRACKER, 7, 0);
        main(s, heard(s, 1, room), hidden(room), 2, hidden(room), 0, room);
    }
}

#[test]
fn on_the_lower_deck_the_tracker_is_a_listen() {
    let s = asked(7, 5, TRACKER, 7, 0);
    main(s, heard(s, 0, 1), hidden(5), 2, hidden(5), 0, 1);
}

#[test(should_fail_with = "the tracker finds you")]
fn the_upper_deck_cannot_hide_from_the_tracker() {
    let s = asked(7, 2, TRACKER, 7, 0);
    main(s, heard(s, 0, 4), hidden(2), 2, hidden(2), 0, 4);
}

#[test(should_fail_with = "next is not the answer")]
fn a_lower_deck_answer_is_never_exact() {
    let s = asked(7, 5, TRACKER, 7, 0);
    main(s, heard(s, 1, 1), hidden(5), 2, hidden(5), 0, 1);
}

#[test(should_fail_with = "next is not the answer")]
fn an_answer_does_not_count_as_acting() {
    let s = asked(2, 7, LISTEN, 0, 0);
    let mut n = heard(s, 0, 8);
    n.acted = 2;
    main(s, n, hidden(7), 2, hidden(7), 0, 8);
}
