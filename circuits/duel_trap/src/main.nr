// TRAP: what changes the actor's traps or Remote Charge, never its room.
// SET_TRAP (1 AP): a trap in the current room, hidden; two at most, in two
// different rooms; with two set, `room` names the one the new one replaces.
// DETONATE (1 AP): reveals one trap's room (`room`) and removes it; the other
// seat answers hit or miss. SET_CHARGE (1 AP, from the Engine Room, revealing
// it): a Remote Charge into `room`, hidden, outside the two-trap limit.
// FIRE_CHARGE (free): it goes off at the start of the setter's next turn,
// before anything else; the other seat answers hit or miss.
use duel::{
    apply_trap, CHARGE, DETONATE, DETONATION, FIRE_CHARGE, fresh, Hidden, hidden, MOVE, pass_turn,
    SET_CHARGE, SET_TRAP, State, with_commitment,
};

fn main(
    state: pub State,
    next: pub State,
    hidden_state: Hidden,
    salt: Field,
    new_hidden: Hidden,
    new_salt: Field,
    action: u8,
    room: u8,
) {
    assert(
        apply_trap(
            state,
            hidden_state,
            salt,
            new_hidden,
            new_salt,
            action,
            room,
        )
            == next,
        "next is not this trap action",
    );
}

fn with(room: u8, traps: [u8; 2], charge: u8) -> Hidden {
    Hidden { room, traps, charge }
}

/// Seat 0 holding `h` (salt 1), seat 1 in the Bridge, seat 0 to play.
fn holding(h: Hidden) -> State {
    with_commitment(fresh(1, 2, 0), 0, h, 1)
}

/// The expected state after a 1-AP trap action of seat 0, built by hand.
fn acted(s: State, h: Hidden, action: u8) -> State {
    let mut n = s;
    n.commitments[0] = h.commit(9);
    n.ap = s.ap - 1;
    n.acted = s.turn;
    n.last = action;
    n
}

#[test]
fn sets_a_trap_in_the_current_room() {
    let s = holding(with(6, [0, 0], 0));
    main(
        s,
        acted(s, with(6, [6, 0], 0), SET_TRAP),
        with(6, [0, 0], 0),
        1,
        with(6, [6, 0], 0),
        9,
        SET_TRAP,
        0,
    );
}

#[test]
fn a_second_trap_takes_the_free_slot() {
    let s = holding(with(6, [0, 3], 0));
    main(
        s,
        acted(s, with(6, [6, 3], 0), SET_TRAP),
        with(6, [0, 3], 0),
        1,
        with(6, [6, 3], 0),
        9,
        SET_TRAP,
        0,
    );
    let s = holding(with(6, [3, 0], 0));
    main(
        s,
        acted(s, with(6, [3, 6], 0), SET_TRAP),
        with(6, [3, 0], 0),
        1,
        with(6, [3, 6], 0),
        9,
        SET_TRAP,
        0,
    );
}

#[test]
fn a_third_trap_replaces_one_of_its_choice() {
    let from = with(6, [3, 4], 0);
    let s = holding(from);
    main(
        s,
        acted(s, with(6, [6, 4], 0), SET_TRAP),
        from,
        1,
        with(6, [6, 4], 0),
        9,
        SET_TRAP,
        3,
    );
    main(
        s,
        acted(s, with(6, [3, 6], 0), SET_TRAP),
        from,
        1,
        with(6, [3, 6], 0),
        9,
        SET_TRAP,
        4,
    );
}

#[test(should_fail_with = "no such trap to replace")]
fn a_third_trap_must_replace_one() {
    let from = with(6, [3, 4], 0);
    let s = holding(from);
    main(
        s,
        acted(s, with(6, [6, 4], 0), SET_TRAP),
        from,
        1,
        with(6, [6, 4], 0),
        9,
        SET_TRAP,
        0,
    );
}

#[test(should_fail_with = "already a trap here")]
fn never_two_traps_in_one_room() {
    let from = with(6, [6, 0], 0);
    let s = holding(from);
    main(
        s,
        acted(s, with(6, [6, 6], 0), SET_TRAP),
        from,
        1,
        with(6, [6, 6], 0),
        9,
        SET_TRAP,
        0,
    );
}

#[test(should_fail_with = "not this trap action")]
fn a_trap_goes_in_the_current_room() {
    let from = with(6, [0, 0], 0);
    let s = holding(from);
    main(
        s,
        acted(s, with(6, [5, 0], 0), SET_TRAP),
        from,
        1,
        with(6, [5, 0], 0),
        9,
        SET_TRAP,
        5,
    );
}

#[test(should_fail_with = "not this trap action")]
fn setting_a_trap_does_not_move() {
    let from = with(6, [0, 0], 0);
    let s = holding(from);
    main(
        s,
        acted(s, with(7, [6, 0], 0), SET_TRAP),
        from,
        1,
        with(7, [6, 0], 0),
        9,
        SET_TRAP,
        0,
    );
}

#[test(should_fail_with = "not enough action points")]
fn a_trap_costs_a_point() {
    let from = with(6, [0, 0], 0);
    let mut s = holding(from);
    s.ap = 0;
    main(s, s, from, 1, with(6, [6, 0], 0), 9, SET_TRAP, 0);
}

#[test]
fn detonates_either_trap_from_anywhere() {
    let from = with(1, [6, 3], 0);
    let s = holding(from);
    let mut n = acted(s, with(1, [0, 3], 0), DETONATE);
    n.phase = DETONATION;
    n.arg_b = 6;
    main(s, n, from, 1, with(1, [0, 3], 0), 9, DETONATE, 6);
    let mut n = acted(s, with(1, [6, 0], 0), DETONATE);
    n.phase = DETONATION;
    n.arg_b = 3;
    main(s, n, from, 1, with(1, [6, 0], 0), 9, DETONATE, 3);
}

#[test(should_fail_with = "no trap there")]
fn cannot_detonate_a_room_without_a_trap() {
    let from = with(1, [6, 0], 0);
    let s = holding(from);
    main(s, s, from, 1, with(1, [6, 0], 0), 9, DETONATE, 5);
}

#[test(should_fail_with = "no trap there")]
fn cannot_detonate_an_empty_slot() {
    let from = with(1, [6, 0], 0);
    let s = holding(from);
    main(s, s, from, 1, from, 9, DETONATE, 0);
}

#[test(should_fail_with = "not this trap action")]
fn a_detonated_trap_is_gone() {
    let from = with(1, [6, 3], 0);
    let s = holding(from);
    let mut n = acted(s, from, DETONATE);
    n.phase = DETONATION;
    n.arg_b = 6;
    main(s, n, from, 1, from, 9, DETONATE, 6);
}

#[test(should_fail_with = "next is not this trap action")]
fn the_detonation_reveals_the_right_room() {
    let from = with(1, [6, 3], 0);
    let s = holding(from);
    let mut n = acted(s, with(1, [0, 3], 0), DETONATE);
    n.phase = DETONATION;
    n.arg_b = 3;
    main(s, n, from, 1, with(1, [0, 3], 0), 9, DETONATE, 6);
}

fn charged(s: State, h: Hidden) -> State {
    let mut n = acted(s, h, SET_CHARGE);
    n.armed = s.armed | 1;
    n.arg_a = 8;
    n
}

#[test]
fn sets_a_remote_charge_beside_two_traps() {
    let from = with(8, [3, 4], 0);
    let s = holding(from);
    for room in 1..8 {
        let to = with(8, [3, 4], room);
        main(s, charged(s, to), from, 1, to, 9, SET_CHARGE, room);
    }
}

#[test(should_fail_with = "not in the Engine Room")]
fn the_charge_is_set_from_the_engine_room() {
    let from = with(7, [0, 0], 0);
    let s = holding(from);
    main(
        s,
        charged(s, with(7, [0, 0], 5)),
        from,
        1,
        with(7, [0, 0], 5),
        9,
        SET_CHARGE,
        5,
    );
}

#[test(should_fail_with = "not a room for the charge")]
fn not_into_the_engine_room() {
    let from = with(8, [0, 0], 0);
    let s = holding(from);
    main(
        s,
        charged(s, with(8, [0, 0], 8)),
        from,
        1,
        with(8, [0, 0], 8),
        9,
        SET_CHARGE,
        8,
    );
}

#[test(should_fail_with = "not a room for the charge")]
fn not_off_the_ship() {
    let from = with(8, [0, 0], 0);
    let s = holding(from);
    main(
        s,
        charged(s, with(8, [0, 0], 9)),
        from,
        1,
        with(8, [0, 0], 9),
        9,
        SET_CHARGE,
        9,
    );
}

#[test(should_fail_with = "a Remote Charge is already set")]
fn one_charge_at_a_time() {
    let from = with(8, [0, 0], 5);
    let mut s = holding(from);
    s.armed = 1;
    s.acted = 1; // set earlier this turn, so not due
    main(
        s,
        charged(s, with(8, [0, 0], 6)),
        from,
        1,
        with(8, [0, 0], 6),
        9,
        SET_CHARGE,
        6,
    );
}

#[test(should_fail_with = "next is not this trap action")]
fn the_charge_is_public_knowledge() {
    let from = with(8, [0, 0], 0);
    let s = holding(from);
    let mut n = charged(s, with(8, [0, 0], 5));
    n.armed = 0;
    main(s, n, from, 1, with(8, [0, 0], 5), 9, SET_CHARGE, 5);
}

/// Seat 0 holding `h` at the start of its next turn after setting a charge.
fn due(h: Hidden) -> State {
    let mut s = holding(h);
    s.armed = 1;
    s.acted = 1;
    pass_turn(pass_turn(s))
}

fn fired(s: State, h: Hidden, room: u8) -> State {
    let mut n = s;
    n.commitments[0] = h.commit(9);
    n.armed = s.armed & 2;
    n.phase = CHARGE;
    n.last = FIRE_CHARGE;
    n.arg_a = 0;
    n.arg_b = room;
    n
}

#[test]
fn the_charge_goes_off_for_free_and_is_gone() {
    let from = with(2, [3, 0], 6);
    let s = due(from);
    assert((s.turn == 3) & (s.actor == 0));
    main(
        s,
        fired(s, with(2, [3, 0], 0), 6),
        from,
        1,
        with(2, [3, 0], 0),
        9,
        FIRE_CHARGE,
        0,
    );
}

#[test]
fn the_opponents_charge_stays_armed() {
    let from = with(2, [0, 0], 6);
    let mut s = due(from);
    s.armed = 3;
    main(
        s,
        fired(s, with(2, [0, 0], 0), 6),
        from,
        1,
        with(2, [0, 0], 0),
        9,
        FIRE_CHARGE,
        0,
    );
}

#[test(should_fail_with = "the Remote Charge is not due")]
fn not_in_the_turn_it_was_set() {
    let from = with(8, [0, 0], 6);
    let mut s = holding(from);
    s.armed = 1;
    s.acted = 1;
    main(
        s,
        fired(s, hidden(8), 6),
        from,
        1,
        hidden(8),
        9,
        FIRE_CHARGE,
        0,
    );
}

#[test(should_fail_with = "the Remote Charge is not due")]
fn not_without_a_charge() {
    let from = with(2, [0, 0], 0);
    let s = holding(from);
    main(s, fired(s, from, 6), from, 1, from, 9, FIRE_CHARGE, 0);
}

#[test(should_fail_with = "the Remote Charge goes off first")]
fn no_trap_before_a_due_charge() {
    let from = with(2, [0, 0], 6);
    let s = due(from);
    main(s, s, from, 1, with(2, [2, 0], 6), 9, SET_TRAP, 0);
}

#[test(should_fail_with = "next is not this trap action")]
fn the_charge_reveals_its_real_room() {
    let from = with(2, [0, 0], 6);
    let s = due(from);
    main(
        s,
        fired(s, with(2, [0, 0], 0), 7),
        from,
        1,
        with(2, [0, 0], 0),
        9,
        FIRE_CHARGE,
        0,
    );
}

#[test(should_fail_with = "not this trap action")]
fn the_charge_does_not_go_off_twice() {
    let from = with(2, [0, 0], 6);
    let s = due(from);
    main(s, fired(s, from, 6), from, 1, from, 9, FIRE_CHARGE, 0);
}

#[test(should_fail_with = "next is not this trap action")]
fn going_off_is_not_acting() {
    let from = with(2, [0, 0], 6);
    let s = due(from);
    let mut n = fired(s, with(2, [0, 0], 0), 6);
    n.acted = s.turn;
    main(s, n, from, 1, with(2, [0, 0], 0), 9, FIRE_CHARGE, 0);
}

#[test(should_fail_with = "not a trap action")]
fn a_move_is_not_a_trap_action() {
    let from = with(6, [0, 0], 0);
    let s = holding(from);
    main(s, s, from, 1, from, 9, MOVE, 0);
}

#[test(should_fail_with = "not a time to act")]
fn not_while_a_query_is_open() {
    let from = with(6, [0, 0], 0);
    let mut s = holding(from);
    s.phase = 17;
    main(s, s, from, 1, with(6, [6, 0], 0), 9, SET_TRAP, 0);
}

#[test(should_fail_with = "commitment does not match")]
fn not_with_made_up_traps() {
    let s = holding(with(1, [0, 0], 0));
    let from = with(1, [6, 0], 0);
    main(s, s, from, 1, with(1, [0, 0], 0), 9, DETONATE, 6);
}
