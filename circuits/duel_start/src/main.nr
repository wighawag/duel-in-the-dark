// A valid starting state for a duel: "the hidden state behind `commitment` is
// a room of the ship, with no trap and no charge", without saying which room.
// Checked when a player creates or joins a match.
use duel::{Hidden, hidden, is_valid_start};

fn main(hidden_state: Hidden, salt: Field, commitment: pub Field) {
    assert(hidden_state.commit(salt) == commitment, "commitment does not match");
    assert(is_valid_start(hidden_state), "not a valid starting state");
}

#[test]
fn every_room_is_a_start() {
    for room in 1..9 {
        main(hidden(room), 7, hidden(room).commit(7));
    }
}

#[test(should_fail_with = "not a valid starting state")]
fn not_outside_the_ship() {
    main(hidden(9), 7, hidden(9).commit(7));
}

#[test(should_fail_with = "not a valid starting state")]
fn not_nowhere() {
    main(hidden(0), 7, hidden(0).commit(7));
}

#[test(should_fail_with = "not a valid starting state")]
fn not_with_a_trap_already_set() {
    let h = Hidden { room: 3, traps: [2, 0], charge: 0 };
    main(h, 7, h.commit(7));
}

#[test(should_fail_with = "not a valid starting state")]
fn not_with_a_charge_already_set() {
    let h = Hidden { room: 3, traps: [0, 0], charge: 5 };
    main(h, 7, h.commit(7));
}

#[test(should_fail_with = "commitment does not match")]
fn not_with_a_wrong_salt() {
    main(hidden(3), 8, hidden(3).commit(7));
}
