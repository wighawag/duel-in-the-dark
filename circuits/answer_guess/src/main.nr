// The ANSWER to a query: "you guessed cell `guess`; here is, truthfully,
// whether I am there". The responder cannot lie about `hit` and reveals
// nothing else: on a miss the guesser only learns one cell they are not in.
//
// The contract supplies `commitment` from its own storage and `guess` from the
// pending query; only `hit` comes from the responder, and the proof binds it.
use commitment::commit;

fn main(cell: Field, salt: Field, commitment: pub Field, guess: pub Field, hit: pub bool) {
    assert(commit(cell, salt) == commitment, "commitment does not match");
    assert((cell == guess) == hit, "hit is not the truth");
}

#[test]
fn a_hit_is_a_hit() {
    main(5, 77, commit(5, 77), 5, true);
}

#[test]
fn a_miss_is_a_miss() {
    main(5, 77, commit(5, 77), 4, false);
}

#[test(should_fail_with = "hit is not the truth")]
fn cannot_deny_a_hit() {
    main(5, 77, commit(5, 77), 5, false);
}

#[test(should_fail_with = "hit is not the truth")]
fn cannot_claim_a_false_hit() {
    main(5, 77, commit(5, 77), 4, true);
}
