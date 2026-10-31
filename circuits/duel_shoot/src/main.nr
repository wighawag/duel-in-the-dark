// SHOOT: the actor reveals their room and shoots into one it can see. 2 action
// points. The other seat must answer next (duel_answer), then the
// shooter makes a free move (duel_move).
use duel::{apply_shoot, fresh, Hidden, hidden, SHOOT, SHOT, State};

fn main(state: pub State, next: pub State, hidden_state: Hidden, salt: Field, target: u8) {
    assert(apply_shoot(state, hidden_state, salt, target) == next, "next is not this shot");
}

fn shot(s: State, from: u8, target: u8) -> State {
    let mut n = s;
    n.ap = 0;
    n.phase = SHOT;
    n.arg_a = from;
    n.arg_b = target;
    n.acted = s.turn;
    n.last = SHOOT;
    n
}

#[test]
fn shoots_into_every_room_it_can_see() {
    let s = fresh(4, 1, 0);
    for target in [2, 4, 5, 6, 7] {
        main(s, shot(s, 4, target), hidden(4), 1, target);
    }
}

#[test(should_fail_with = "cannot shoot there from here")]
fn cannot_shoot_out_of_sight() {
    let s = fresh(5, 1, 0);
    main(s, shot(s, 5, 4), hidden(5), 1, 4);
}

#[test(should_fail_with = "cannot shoot there from here")]
fn cannot_shoot_nowhere() {
    let s = fresh(5, 1, 0);
    main(s, shot(s, 5, 0), hidden(5), 1, 0);
}

#[test(should_fail_with = "commitment does not match")]
fn cannot_shoot_from_a_room_it_is_not_in() {
    let s = fresh(5, 1, 0);
    main(s, shot(s, 4, 2), hidden(4), 1, 2);
}

#[test(should_fail_with = "not enough action points")]
fn cannot_shoot_with_one_point() {
    let mut s = fresh(5, 1, 0);
    s.ap = 1;
    main(s, shot(s, 5, 6), hidden(5), 1, 6);
}

#[test(should_fail_with = "not a time to shoot")]
fn cannot_shoot_twice() {
    let mut s = shot(fresh(5, 1, 0), 5, 6);
    s.ap = 2;
    main(s, shot(s, 5, 6), hidden(5), 1, 6);
}

#[test(should_fail_with = "next is not this shot")]
fn cannot_reveal_another_room() {
    let s = fresh(5, 1, 0);
    main(s, shot(s, 6, 6), hidden(5), 1, 6);
}

#[test(should_fail_with = "next is not this shot")]
fn cannot_claim_another_target() {
    let s = fresh(5, 1, 0);
    main(s, shot(s, 5, 7), hidden(5), 1, 6);
}

#[test(should_fail_with = "the Remote Charge goes off first")]
fn nothing_before_a_due_charge() {
    let mut s = fresh(5, 1, 1);
    s.commitments[1] = hidden(5).commit(2);
    s.armed = 2;
    main(s, shot(s, 5, 6), hidden(5), 2, 6);
}

#[test(should_fail_with = "next is not this shot")]
fn cannot_hide_that_it_acted() {
    let s = fresh(5, 1, 0);
    let mut n = shot(s, 5, 6);
    n.acted = 0;
    main(s, n, hidden(5), 1, 6);
}

#[test(should_fail_with = "next is not this shot")]
fn cannot_pass_for_another_action() {
    let s = fresh(5, 1, 0);
    let mut n = shot(s, 5, 6);
    n.last = 1;
    main(s, n, hidden(5), 1, 6);
}

#[test(should_fail_with = "next is not this shot")]
fn cannot_open_another_query() {
    let s = fresh(5, 1, 0);
    let mut n = shot(s, 5, 6);
    n.phase = 18;
    main(s, n, hidden(5), 1, 6);
}
