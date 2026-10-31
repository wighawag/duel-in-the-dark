// MOVE: the actor goes to an adjacent room, hidden. 1 action point during
// play; free, and only out of the revealed room, right after a shot.
use duel::{
    apply_answer_shot, apply_move, apply_shoot, fresh, Hidden, hidden, MOVE_AFTER_SHOT, PLAY, State,
};

fn main(
    state: pub State,
    next: pub State,
    hidden_state: Hidden,
    salt: Field,
    new_hidden: Hidden,
    new_salt: Field,
) {
    assert(
        apply_move(state, hidden_state, salt, new_hidden, new_salt) == next,
        "next is not this move",
    );
}

fn moved(s: State, to: u8, salt: Field) -> State {
    let mut n = s;
    n.commitments[s.actor as u32] = hidden(to).commit(salt);
    n.ap = s.ap - 1;
    n
}

#[test]
fn moves_to_an_adjacent_room() {
    let s = fresh(1, 8, 0);
    main(s, moved(s, 2, 9), hidden(1), 1, hidden(2), 9);
    let s = fresh(1, 8, 1);
    main(s, moved(s, 3, 9), hidden(8), 2, hidden(3), 9);
}

#[test]
fn the_forced_move_is_free() {
    let s = apply_answer_shot(apply_shoot(fresh(7, 1, 0), hidden(7), 1, 5), hidden(1), 2);
    assert(s.phase == MOVE_AFTER_SHOT);
    let mut n = s;
    n.commitments[0] = hidden(4).commit(9);
    n.phase = PLAY;
    n.arg_a = 0;
    n.arg_b = 0;
    main(s, n, hidden(7), 1, hidden(4), 9);
}

#[test(should_fail_with = "not an adjacent room")]
fn cannot_jump() {
    let s = fresh(1, 8, 0);
    main(s, moved(s, 3, 9), hidden(1), 1, hidden(3), 9);
}

#[test(should_fail_with = "not an adjacent room")]
fn cannot_stay() {
    let s = fresh(1, 8, 0);
    main(s, moved(s, 1, 9), hidden(1), 1, hidden(1), 9);
}

#[test(should_fail_with = "not an adjacent room")]
fn cannot_leave_the_ship() {
    let s = fresh(8, 1, 0);
    main(s, moved(s, 9, 9), hidden(8), 1, hidden(9), 9);
}

#[test(should_fail_with = "commitment does not match")]
fn cannot_move_from_a_made_up_room() {
    let s = fresh(1, 8, 0);
    main(s, moved(s, 4, 9), hidden(2), 1, hidden(4), 9);
}

#[test(should_fail_with = "commitment does not match")]
fn cannot_move_the_other_seat() {
    let s = fresh(1, 8, 0);
    main(s, moved(s, 7, 9), hidden(8), 2, hidden(7), 9);
}

#[test(should_fail_with = "not enough action points")]
fn cannot_move_without_points() {
    let mut s = fresh(1, 8, 0);
    s.ap = 0;
    main(s, s, hidden(1), 1, hidden(2), 9);
}

#[test(should_fail_with = "a move only moves")]
fn cannot_set_a_trap_while_moving() {
    let s = fresh(1, 8, 0);
    let to = Hidden { room: 2, traps: [1, 0], charge: 0 };
    let mut n = moved(s, 2, 9);
    n.commitments[0] = to.commit(9);
    main(s, n, hidden(1), 1, to, 9);
}

#[test(should_fail_with = "must move out of the room it shot from")]
fn the_forced_move_starts_from_the_revealed_room() {
    let mut s = fresh(5, 1, 0);
    s.phase = MOVE_AFTER_SHOT;
    s.arg_a = 7;
    s.ap = 0;
    let mut n = s;
    n.commitments[0] = hidden(6).commit(9);
    n.phase = PLAY;
    n.arg_a = 0;
    main(s, n, hidden(5), 1, hidden(6), 9);
}

#[test(should_fail_with = "not a time to move")]
fn cannot_move_while_a_shot_is_unanswered() {
    let s = apply_shoot(fresh(1, 8, 0), hidden(1), 1, 2);
    main(s, s, hidden(1), 1, hidden(2), 9);
}

#[test(should_fail_with = "next is not this move")]
fn cannot_claim_another_next() {
    let s = fresh(1, 8, 0);
    let mut n = moved(s, 2, 9);
    n.ap = 2; // keeping the point
    main(s, n, hidden(1), 1, hidden(2), 9);
}

#[test(should_fail_with = "next is not this move")]
fn cannot_tamper_with_the_score() {
    let s = fresh(1, 8, 0);
    let mut n = moved(s, 2, 9);
    n.hits = [0, 1];
    main(s, n, hidden(1), 1, hidden(2), 9);
}
