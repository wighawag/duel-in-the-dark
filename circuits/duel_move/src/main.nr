// MOVE: the actor's room changes, hidden. MOVE (1 AP, to an adjacent room),
// FORCED_MOVE (free, out of the room a shot revealed, right after it) or
// DROP_DOWN (free, Observation Gantry to Galley, revealing both).
use duel::{
    apply_answer, apply_move, apply_shoot, DROP_DOWN, FORCED_MOVE, fresh, Hidden, hidden, MOVE,
    MOVE_AFTER_SHOT, PLAY, SHOOT, State,
};

fn main(
    state: pub State,
    next: pub State,
    hidden_state: Hidden,
    salt: Field,
    new_hidden: Hidden,
    new_salt: Field,
    action: u8,
) {
    assert(
        apply_move(state, hidden_state, salt, new_hidden, new_salt, action) == next,
        "next is not this move",
    );
}

/// The expected state after an ordinary move to `to`, built by hand.
fn moved(s: State, to: u8, salt: Field) -> State {
    let mut n = s;
    n.commitments[s.actor as u32] = hidden(to).commit(salt);
    n.ap = s.ap - 1;
    n.acted = s.turn;
    n.last = MOVE;
    n
}

#[test]
fn moves_to_an_adjacent_room() {
    let s = fresh(1, 8, 0);
    main(s, moved(s, 2, 9), hidden(1), 1, hidden(2), 9, MOVE);
    let s = fresh(1, 8, 1);
    main(s, moved(s, 3, 9), hidden(8), 2, hidden(3), 9, MOVE);
}

#[test]
fn clears_the_last_actions_data() {
    let mut s = fresh(1, 8, 0);
    s.arg_a = 5;
    s.arg_b = 7;
    s.last = 3;
    let mut n = moved(s, 2, 9);
    n.arg_a = 0;
    n.arg_b = 0;
    main(s, n, hidden(1), 1, hidden(2), 9, MOVE);
}

#[test]
fn the_forced_move_is_free() {
    let s = apply_answer(
        apply_shoot(fresh(7, 1, 0), hidden(7), 1, 5),
        hidden(1),
        2,
        hidden(1),
        0,
        0,
    );
    assert(s.phase == MOVE_AFTER_SHOT);
    let mut n = s;
    n.commitments[0] = hidden(4).commit(9);
    n.phase = PLAY;
    n.arg_a = 0;
    n.arg_b = 0;
    n.last = FORCED_MOVE;
    main(s, n, hidden(7), 1, hidden(4), 9, FORCED_MOVE);
}

#[test]
fn drops_down_for_free_revealing_both_rooms() {
    let s = fresh(4, 1, 0);
    let mut n = s;
    n.commitments[0] = hidden(5).commit(9);
    n.acted = 1;
    n.last = DROP_DOWN;
    n.arg_a = 4;
    n.arg_b = 5;
    main(s, n, hidden(4), 1, hidden(5), 9, DROP_DOWN);
}

#[test(should_fail_with = "not an adjacent room")]
fn cannot_jump() {
    let s = fresh(1, 8, 0);
    main(s, moved(s, 3, 9), hidden(1), 1, hidden(3), 9, MOVE);
}

#[test(should_fail_with = "not an adjacent room")]
fn cannot_stay() {
    let s = fresh(1, 8, 0);
    main(s, moved(s, 1, 9), hidden(1), 1, hidden(1), 9, MOVE);
}

#[test(should_fail_with = "not an adjacent room")]
fn cannot_leave_the_ship() {
    let s = fresh(8, 1, 0);
    main(s, moved(s, 9, 9), hidden(8), 1, hidden(9), 9, MOVE);
}

#[test(should_fail_with = "not an adjacent room")]
fn the_drop_down_is_not_a_path_back() {
    let s = fresh(5, 1, 0);
    main(s, moved(s, 4, 9), hidden(5), 1, hidden(4), 9, MOVE);
}

#[test(should_fail_with = "commitment does not match")]
fn cannot_move_from_a_made_up_room() {
    let s = fresh(1, 8, 0);
    main(s, moved(s, 4, 9), hidden(2), 1, hidden(4), 9, MOVE);
}

#[test(should_fail_with = "commitment does not match")]
fn cannot_move_the_other_seat() {
    let s = fresh(1, 8, 0);
    main(s, moved(s, 7, 9), hidden(8), 2, hidden(7), 9, MOVE);
}

#[test(should_fail_with = "not enough action points")]
fn cannot_move_without_points() {
    let mut s = fresh(1, 8, 0);
    s.ap = 0;
    main(s, s, hidden(1), 1, hidden(2), 9, MOVE);
}

#[test(should_fail_with = "a move only moves")]
fn cannot_set_a_trap_while_moving() {
    let s = fresh(1, 8, 0);
    let to = Hidden { room: 2, traps: [1, 0], charge: 0 };
    let mut n = moved(s, 2, 9);
    n.commitments[0] = to.commit(9);
    main(s, n, hidden(1), 1, to, 9, MOVE);
}

#[test(should_fail_with = "a move only moves")]
fn cannot_drop_a_charge_while_moving() {
    let s = fresh(1, 8, 0);
    let from = Hidden { room: 1, traps: [0, 0], charge: 4 };
    let mut s2 = s;
    s2.commitments[0] = from.commit(1);
    main(s2, moved(s2, 2, 9), from, 1, hidden(2), 9, MOVE);
}

#[test(should_fail_with = "must move out of the room it shot from")]
fn the_forced_move_starts_from_the_revealed_room() {
    let mut s = fresh(5, 1, 0);
    s.phase = MOVE_AFTER_SHOT;
    s.arg_a = 7;
    s.ap = 0;
    s.acted = 1;
    let mut n = s;
    n.commitments[0] = hidden(6).commit(9);
    n.phase = PLAY;
    n.arg_a = 0;
    n.last = FORCED_MOVE;
    main(s, n, hidden(5), 1, hidden(6), 9, FORCED_MOVE);
}

#[test(should_fail_with = "no move is owed")]
fn no_free_move_without_a_shot() {
    let s = fresh(1, 8, 0);
    let mut n = moved(s, 2, 9);
    n.ap = 2;
    n.last = FORCED_MOVE;
    main(s, n, hidden(1), 1, hidden(2), 9, FORCED_MOVE);
}

#[test(should_fail_with = "not a time to act")]
fn cannot_move_while_a_shot_is_unanswered() {
    let s = apply_shoot(fresh(1, 8, 0), hidden(1), 1, 2);
    main(s, s, hidden(1), 1, hidden(2), 9, MOVE);
}

#[test(should_fail_with = "not a time to act")]
fn the_forced_move_is_not_a_drop_down() {
    let s = apply_answer(
        apply_shoot(fresh(4, 1, 0), hidden(4), 1, 2),
        hidden(1),
        2,
        hidden(1),
        0,
        0,
    );
    main(s, s, hidden(4), 1, hidden(5), 9, DROP_DOWN);
}

#[test(should_fail_with = "not on the Observation Gantry")]
fn drops_down_only_from_the_gantry() {
    let s = fresh(2, 1, 0);
    main(s, s, hidden(2), 1, hidden(5), 9, DROP_DOWN);
}

#[test(should_fail_with = "the drop lands in the Galley")]
fn drops_down_only_into_the_galley() {
    let s = fresh(4, 1, 0);
    main(s, s, hidden(4), 1, hidden(7), 9, DROP_DOWN);
}

#[test(should_fail_with = "not a move")]
fn a_shot_is_not_a_move() {
    let s = fresh(1, 8, 0);
    main(s, moved(s, 2, 9), hidden(1), 1, hidden(2), 9, SHOOT);
}

#[test(should_fail_with = "the room is sealed")]
fn cannot_enter_the_sealed_room() {
    let mut s = fresh(7, 1, 0);
    s.sealed = 8;
    s.sealed_turn = 1;
    main(s, moved(s, 8, 9), hidden(7), 1, hidden(8), 9, MOVE);
}

#[test(should_fail_with = "the room is sealed")]
fn the_seal_holds_through_the_next_turn() {
    let mut s = fresh(7, 1, 0);
    s.sealed = 8;
    s.sealed_turn = 1;
    s.turn = 2; // the opponent's turn, right after the purge
    main(s, moved(s, 8, 9), hidden(7), 1, hidden(8), 9, MOVE);
}

#[test]
fn the_seal_is_gone_at_the_purgers_next_turn() {
    let mut s = fresh(7, 1, 0);
    s.sealed = 8;
    s.sealed_turn = 1;
    s.turn = 3;
    main(s, moved(s, 8, 9), hidden(7), 1, hidden(8), 9, MOVE);
}

#[test(should_fail_with = "the Remote Charge goes off first")]
fn nothing_before_a_due_charge() {
    let mut s = fresh(1, 8, 0);
    s.armed = 1;
    main(s, moved(s, 2, 9), hidden(1), 1, hidden(2), 9, MOVE);
}

#[test]
fn the_opponents_charge_does_not_block() {
    let mut s = fresh(1, 8, 0);
    s.armed = 2;
    main(s, moved(s, 2, 9), hidden(1), 1, hidden(2), 9, MOVE);
}

#[test(should_fail_with = "next is not this move")]
fn cannot_claim_another_next() {
    let s = fresh(1, 8, 0);
    let mut n = moved(s, 2, 9);
    n.ap = 2; // keeping the point
    main(s, n, hidden(1), 1, hidden(2), 9, MOVE);
}

#[test(should_fail_with = "next is not this move")]
fn cannot_tamper_with_the_score() {
    let s = fresh(1, 8, 0);
    let mut n = moved(s, 2, 9);
    n.hits = [0, 1];
    main(s, n, hidden(1), 1, hidden(2), 9, MOVE);
}

#[test(should_fail_with = "next is not this move")]
fn cannot_pass_for_another_action() {
    let s = fresh(1, 8, 0);
    let mut n = moved(s, 2, 9);
    n.last = 5;
    main(s, n, hidden(1), 1, hidden(2), 9, MOVE);
}

#[test(should_fail_with = "next is not this move")]
fn cannot_hide_that_it_acted() {
    let s = fresh(1, 8, 0);
    let mut n = moved(s, 2, 9);
    n.acted = 0;
    main(s, n, hidden(1), 1, hidden(2), 9, MOVE);
}

#[test(should_fail_with = "next is not this move")]
fn cannot_touch_the_turn_counters() {
    let s = fresh(1, 8, 0);
    let mut n = moved(s, 2, 9);
    n.turn = 2;
    main(s, n, hidden(1), 1, hidden(2), 9, MOVE);
}

#[test(should_fail_with = "next is not this move")]
fn cannot_touch_the_seal_or_the_charges() {
    let s = fresh(1, 8, 0);
    let mut n = moved(s, 2, 9);
    n.sealed = 8;
    n.sealed_turn = 1;
    n.armed = 2;
    n.tracked = 1;
    main(s, n, hidden(1), 1, hidden(2), 9, MOVE);
}
