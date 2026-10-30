// The smallest thing a hidden-information game proves: "the value behind this
// commitment is one of the `max` allowed values", without saying which.
//
// The commitment is Poseidon2(value, salt). The salt is what stops anyone from
// brute-forcing a small value space by hashing every candidate, so it must be
// random and kept secret alongside the value.
use poseidon::poseidon2::Poseidon2;

fn main(value: Field, salt: Field, max: pub Field, commitment: pub Field) {
    assert(commit(value, salt) == commitment, "commitment does not match");
    assert(value.lt(max), "value out of range");
}

pub fn commit(value: Field, salt: Field) -> Field {
    Poseidon2::hash([value, salt], 2)
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

// Pins the hash so the JS side (src/index.ts `commit`) can be checked against
// the same number: if this ever changes, every stored commitment changes too.
#[test]
fn commitment_is_stable() {
    assert(commit(3, 12345) == 0x227735108cd5c0afb4afc8fa7e1ce1863afd0b043188d437df9e960f2f52f561);
}
