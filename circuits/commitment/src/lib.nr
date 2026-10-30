// The one way hidden state is committed to, shared by every circuit so that a
// commitment written by one circuit is read by the next.
//
// Poseidon2(value, salt). The salt stops anyone from brute-forcing a small
// value space by hashing every candidate, so it must be random and secret.
// TypeScript computes the same hash with `zk.commit([value, salt])` (bb.js
// poseidon2Hash); the pinned test below and its twin in circuits/test keep the
// two in step.
use poseidon::poseidon2::Poseidon2;

pub fn commit(value: Field, salt: Field) -> Field {
    Poseidon2::hash([value, salt], 2)
}

#[test]
fn commitment_is_stable() {
    assert(commit(3, 12345) == 0x227735108cd5c0afb4afc8fa7e1ce1863afd0b043188d437df9e960f2f52f561);
}
