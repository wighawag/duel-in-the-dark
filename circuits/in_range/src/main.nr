// The smallest thing a hidden-information game proves: "the value behind this
// commitment is one of the `max` allowed values", without saying which. The
// reference game uses it when a player joins: their hiding cell is valid.
use commitment::commit;

fn main(value: Field, salt: Field, max: pub Field, commitment: pub Field) {
    assert(commit(value, salt) == commitment, "commitment does not match");
    assert(value.lt(max), "value out of range");
}

#[test]
fn accepts_a_value_in_range() {
    main(3, 12345, 8, commit(3, 12345));
}

#[test(should_fail_with = "value out of range")]
fn rejects_a_value_out_of_range() {
    main(8, 12345, 8, commit(8, 12345));
}

#[test(should_fail_with = "commitment does not match")]
fn rejects_a_wrong_salt() {
    main(3, 1, 8, commit(3, 12345));
}
