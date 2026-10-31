// EFFECT: what the actor does without changing its hidden state.
// LISTEN (1 AP): the other seat names a room next to its own; no secret of
// the actor's is involved. The room effects reveal the actor's room:
// COOLANT_PURGE (1 AP, Cryo Bay): seals the Engine Room; whoever is in it is
// hit and moves out. MAINTENANCE_CHUTE (1 AP, Science Lab): whoever is in the
// Galley drops to the Engine Room. STIM_RATIONS (free, Galley, before any
// other own action this turn): one more action point. MOTION_TRACKER (free,
// Cargo Hold, once per turn): a listen that finds an upper-deck room exactly.
use duel::{
    apply_effect, CHUTE, COOLANT_PURGE, fresh, Hidden, hidden, LISTEN, LISTEN_ACTION,
    MAINTENANCE_CHUTE, MOTION_TRACKER, MOVE, PURGE, State, STIM_RATIONS, TRACKER,
};

fn main(state: pub State, next: pub State, hidden_state: Hidden, salt: Field, action: u8) {
    assert(apply_effect(state, hidden_state, salt, action) == next, "next is not this effect");
}

/// The expected state after seat 0's `action` from `room`, built by hand.
fn used(s: State, action: u8, room: u8, cost: u8, phase: u8) -> State {
    let mut n = s;
    n.ap = s.ap - cost;
    n.acted = s.turn;
    n.last = action;
    n.phase = phase;
    n.arg_a = room;
    n
}

#[test]
fn listens_for_a_point_without_any_secret() {
    let s = fresh(6, 1, 0);
    // whatever is passed as the actor's hidden state is never looked at
    main(
        s,
        used(s, LISTEN_ACTION, 0, 1, LISTEN),
        hidden(3),
        77,
        LISTEN_ACTION,
    );
}

#[test(should_fail_with = "not enough action points")]
fn a_listen_costs_a_point() {
    let mut s = fresh(6, 1, 0);
    s.ap = 0;
    main(s, s, hidden(6), 1, LISTEN_ACTION);
}

#[test]
fn purges_the_engine_room_from_the_cryo_bay() {
    let mut s = fresh(1, 8, 0);
    s.turn = 7;
    let mut n = used(s, COOLANT_PURGE, 1, 1, PURGE);
    n.arg_b = 8;
    n.sealed = 8;
    n.sealed_turn = 7;
    main(s, n, hidden(1), 1, COOLANT_PURGE);
}

#[test(should_fail_with = "not in the Cryo Bay")]
fn purges_only_from_the_cryo_bay() {
    let s = fresh(2, 8, 0);
    main(s, s, hidden(2), 1, COOLANT_PURGE);
}

#[test(should_fail_with = "commitment does not match")]
fn cannot_claim_to_be_in_the_cryo_bay() {
    let s = fresh(2, 8, 0);
    main(s, s, hidden(1), 1, COOLANT_PURGE);
}

#[test(should_fail_with = "next is not this effect")]
fn the_purge_seals_the_engine_room_now() {
    let s = fresh(1, 8, 0);
    let mut n = used(s, COOLANT_PURGE, 1, 1, PURGE);
    n.arg_b = 8;
    n.sealed = 8;
    n.sealed_turn = 0;
    main(s, n, hidden(1), 1, COOLANT_PURGE);
}

#[test]
fn opens_the_chute_from_the_science_lab() {
    let s = fresh(3, 5, 0);
    let mut n = used(s, MAINTENANCE_CHUTE, 3, 1, CHUTE);
    n.arg_b = 5;
    main(s, n, hidden(3), 1, MAINTENANCE_CHUTE);
}

#[test(should_fail_with = "not in the Science Lab")]
fn the_chute_only_from_the_science_lab() {
    let s = fresh(2, 5, 0);
    main(s, s, hidden(2), 1, MAINTENANCE_CHUTE);
}

#[test(should_fail_with = "not enough action points")]
fn the_chute_costs_a_point() {
    let mut s = fresh(3, 5, 0);
    s.ap = 0;
    main(s, s, hidden(3), 1, MAINTENANCE_CHUTE);
}

#[test]
fn stim_rations_give_a_third_point() {
    let s = fresh(5, 1, 0);
    let mut n = used(s, STIM_RATIONS, 5, 0, 0);
    n.ap = 3;
    main(s, n, hidden(5), 1, STIM_RATIONS);
}

#[test(should_fail_with = "only at the start of the turn")]
fn stim_rations_only_before_acting() {
    let mut s = fresh(5, 1, 0);
    s.acted = 1;
    s.ap = 1;
    main(s, s, hidden(5), 1, STIM_RATIONS);
}

#[test(should_fail_with = "only at the start of the turn")]
fn stim_rations_only_once() {
    let s = fresh(5, 1, 0);
    let once = apply_effect(s, hidden(5), 1, STIM_RATIONS);
    main(once, once, hidden(5), 1, STIM_RATIONS);
}

#[test(should_fail_with = "not in the Galley")]
fn stim_rations_only_in_the_galley() {
    let s = fresh(6, 1, 0);
    main(s, s, hidden(6), 1, STIM_RATIONS);
}

#[test]
fn tracks_for_free_once_per_turn() {
    let mut s = fresh(7, 1, 0);
    s.ap = 0;
    s.acted = 1;
    let mut n = used(s, MOTION_TRACKER, 7, 0, TRACKER);
    n.tracked = 1;
    main(s, n, hidden(7), 1, MOTION_TRACKER);
}

#[test]
fn tracks_again_next_turn() {
    let mut s = fresh(7, 1, 0);
    s.tracked = 1;
    s.turn = 3;
    let mut n = used(s, MOTION_TRACKER, 7, 0, TRACKER);
    n.tracked = 3;
    main(s, n, hidden(7), 1, MOTION_TRACKER);
}

#[test(should_fail_with = "once per turn")]
fn not_twice_in_a_turn() {
    let mut s = fresh(7, 1, 0);
    s.tracked = 1;
    main(s, s, hidden(7), 1, MOTION_TRACKER);
}

#[test(should_fail_with = "not in the Cargo Hold")]
fn tracks_only_from_the_cargo_hold() {
    let s = fresh(6, 1, 0);
    main(s, s, hidden(6), 1, MOTION_TRACKER);
}

#[test(should_fail_with = "next is not this effect")]
fn an_effect_reveals_the_real_room() {
    let s = fresh(7, 1, 0);
    let mut n = used(s, MOTION_TRACKER, 6, 0, TRACKER);
    n.tracked = 1;
    main(s, n, hidden(7), 1, MOTION_TRACKER);
}

#[test(should_fail_with = "the Remote Charge goes off first")]
fn nothing_before_a_due_charge() {
    let mut s = fresh(5, 1, 0);
    s.armed = 1;
    main(s, s, hidden(5), 1, STIM_RATIONS);
}

#[test(should_fail_with = "not a time to act")]
fn not_while_a_query_is_open() {
    let mut s = fresh(5, 1, 0);
    s.phase = 16;
    main(s, s, hidden(5), 1, LISTEN_ACTION);
}

#[test(should_fail_with = "not an effect")]
fn a_move_is_not_an_effect() {
    let s = fresh(5, 1, 0);
    main(s, s, hidden(5), 1, MOVE);
}
