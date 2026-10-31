// The ANSWER to a shot: the target proves whether it was in the room shot at.
// It cannot lie, and reveals nothing else. Its own commitment is unchanged.
use duel::{apply_answer_shot, apply_shoot, fresh, Hidden, hidden, MOVE_AFTER_SHOT, OVER, State};

fn main(state: pub State, next: pub State, hidden_state: Hidden, salt: Field) {
    assert(apply_answer_shot(state, hidden_state, salt) == next, "next is not the answer");
}

fn answered(s: State, hits: [u8; 2], phase: u8) -> State {
    let mut n = s;
    n.hits = hits;
    n.phase = phase;
    n
}

#[test]
fn a_hit_is_a_hit() {
    let s = apply_shoot(fresh(2, 3, 0), hidden(2), 1, 3);
    main(s, answered(s, [0, 1], MOVE_AFTER_SHOT), hidden(3), 2);
}

#[test]
fn a_miss_is_a_miss() {
    let s = apply_shoot(fresh(2, 3, 0), hidden(2), 1, 4);
    main(s, answered(s, [0, 0], MOVE_AFTER_SHOT), hidden(3), 2);
}

#[test]
fn seat_one_shooting_seat_zero() {
    let s = apply_shoot(fresh(2, 3, 1), hidden(3), 2, 2);
    main(s, answered(s, [1, 0], MOVE_AFTER_SHOT), hidden(2), 1);
}

#[test]
fn the_second_hit_is_over() {
    let mut s = fresh(2, 3, 0);
    s.hits = [1, 1];
    let s = apply_shoot(s, hidden(2), 1, 3);
    main(s, answered(s, [1, 2], OVER), hidden(3), 2);
}

#[test(should_fail_with = "next is not the answer")]
fn cannot_deny_a_hit() {
    let s = apply_shoot(fresh(2, 3, 0), hidden(2), 1, 3);
    main(s, answered(s, [0, 0], MOVE_AFTER_SHOT), hidden(3), 2);
}

#[test(should_fail_with = "next is not the answer")]
fn cannot_claim_a_false_hit() {
    let s = apply_shoot(fresh(2, 3, 0), hidden(2), 1, 4);
    main(s, answered(s, [0, 1], MOVE_AFTER_SHOT), hidden(3), 2);
}

#[test(should_fail_with = "commitment does not match")]
fn cannot_answer_from_another_room() {
    let s = apply_shoot(fresh(2, 3, 0), hidden(2), 1, 3);
    main(s, answered(s, [0, 0], MOVE_AFTER_SHOT), hidden(4), 2);
}

#[test(should_fail_with = "commitment does not match")]
fn the_shooter_cannot_answer() {
    let s = apply_shoot(fresh(2, 3, 0), hidden(2), 1, 3);
    main(s, answered(s, [0, 0], MOVE_AFTER_SHOT), hidden(2), 1);
}

#[test(should_fail_with = "no shot to answer")]
fn nothing_to_answer() {
    let s = fresh(2, 3, 0);
    main(s, s, hidden(3), 2);
}
