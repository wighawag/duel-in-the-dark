// A HIDDEN TRANSITION: "I moved from the cell behind `commitment` to a
// neighbouring cell, now behind `new_commitment`", without saying where from
// or where to. The pattern every hidden move uses: the old commitment comes
// from the contract's storage, the new one replaces it once this is verified.
//
// The board is a ring of CELLS cells, so every cell has exactly two
// neighbours. Staying put is not a move.
use commitment::commit;

global CELLS: u32 = 8;

fn main(
    cell: u32,
    salt: Field,
    new_cell: u32,
    new_salt: Field,
    commitment: pub Field,
    new_commitment: pub Field,
) {
    assert(commit(cell as Field, salt) == commitment, "commitment does not match");
    assert(new_cell < CELLS, "no such cell");
    let forward = new_cell == (cell + 1) % CELLS;
    let backward = cell == (new_cell + 1) % CELLS;
    assert(forward | backward, "not a neighbouring cell");
    assert(commit(new_cell as Field, new_salt) == new_commitment, "new commitment does not match");
}

#[test]
fn moves_forward() {
    main(3, 1, 4, 2, commit(3, 1), commit(4, 2));
}

#[test]
fn wraps_around_the_ring() {
    main(7, 1, 0, 2, commit(7, 1), commit(0, 2));
    main(0, 1, 7, 2, commit(0, 1), commit(7, 2));
}

#[test(should_fail_with = "not a neighbouring cell")]
fn cannot_jump() {
    main(3, 1, 5, 2, commit(3, 1), commit(5, 2));
}

#[test(should_fail_with = "not a neighbouring cell")]
fn cannot_stay() {
    main(3, 1, 3, 2, commit(3, 1), commit(3, 2));
}

#[test(should_fail_with = "no such cell")]
fn cannot_leave_the_board() {
    main(7, 1, 8, 2, commit(7, 1), commit(8, 2));
}
