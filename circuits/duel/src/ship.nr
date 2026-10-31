// The ship: public map data, written once for every duel circuit.
//
// Rooms are 1..8 (0 means "no room"), numbered as the 2023 ship SVG:
// upper deck 1 Cryo Bay, 2 Bridge, 3 Science Lab, 4 Observation Gantry;
// lower deck 5 Galley, 6 Mess Hall, 7 Cargo Hold, 8 Engine Room.
//
// Each table is DIRECTED, one 8-bit mask per room it is read FROM (in hex, since Noir has no binary literals): bit r-1 is
// set when room r can be reached (moved to, or shot into) from it. Nothing
// assumes symmetry: the shoot table is not symmetric, and the map may gain
// one-way paths. circuits/src/duel.ts holds the same tables for the UI, and
// circuits/test checks the two agree on all 64 room pairs.

pub global ROOMS: u8 = 8;

global MOVES: [u8; 9] = [
    0, // no room
    0x12, // 1 Cryo Bay -> 2, 5
    0x0d, // 2 Bridge -> 1, 3, 4
    0x82, // 3 Science Lab -> 2, 8
    0x42, // 4 Observation Gantry -> 2, 7
    0x61, // 5 Galley -> 1, 6, 7
    0xd0, // 6 Mess Hall -> 5, 7, 8
    0xb8, // 7 Cargo Hold -> 4, 5, 6, 8
    0x64, // 8 Engine Room -> 3, 6, 7
];

global SHOTS: [u8; 9] = [
    0, // no room
    0x0b, // 1 Cryo Bay -> 1, 2, 4
    0x0f, // 2 Bridge -> 1, 2, 3, 4
    0x0e, // 3 Science Lab -> 2, 3, 4
    0x7a, // 4 Observation Gantry -> 2, 4, 5, 6, 7
    0x70, // 5 Galley -> 5, 6, 7
    0x70, // 6 Mess Hall -> 5, 6, 7
    0x70, // 7 Cargo Hold -> 5, 6, 7
    0xe0, // 8 Engine Room -> 6, 7, 8
];

pub fn is_room(room: u8) -> bool {
    (room >= 1) & (room <= ROOMS)
}

fn reaches(table: [u8; 9], from: u8, to: u8) -> bool {
    // Both sides of the `&` are evaluated, so an index and a shift are only
    // computed from a real room (anything else reads "no room").
    let row = if is_room(from) { table[from as u32] } else { 0 };
    let bit = if is_room(to) { to - 1 } else { 0 };
    is_room(to) & (((row >> bit) & 1) == 1)
}

pub fn can_move(from: u8, to: u8) -> bool {
    reaches(MOVES, from, to)
}

pub fn can_shoot(from: u8, into: u8) -> bool {
    reaches(SHOTS, from, into)
}

#[test]
fn the_moves_are_the_map() {
    let moves: [[u8; 4]; 9] = [
        [0, 0, 0, 0],
        [2, 5, 0, 0],
        [4, 1, 3, 0],
        [2, 8, 0, 0],
        [2, 7, 0, 0],
        [1, 6, 7, 0],
        [7, 5, 8, 0],
        [4, 8, 5, 6],
        [7, 6, 3, 0],
    ];
    for from in 1..9 {
        let mut count = 0;
        for to in 0..10 {
            if can_move(from, to) {
                count += 1;
            }
        }
        let mut listed = 0;
        for i in 0..4 {
            let to = moves[from as u32][i];
            if to != 0 {
                listed += 1;
                assert(can_move(from, to));
            }
        }
        assert(count == listed);
        assert(!can_move(from, from));
    }
}

// A fact about the milestone C map's DATA, not a rule: drop it if the map
// gains a one-way path.
#[test]
fn the_milestone_c_moves_happen_to_be_symmetric() {
    for a in 1..9 {
        for b in 1..9 {
            assert(can_move(a, b) == can_move(b, a));
        }
    }
}

#[test]
fn the_shots_are_the_map() {
    let shots: [[u8; 5]; 9] = [
        [0, 0, 0, 0, 0],
        [1, 2, 4, 0, 0],
        [2, 4, 1, 3, 0],
        [3, 2, 4, 0, 0],
        [4, 2, 7, 5, 6],
        [5, 6, 7, 0, 0],
        [6, 7, 5, 0, 0],
        [7, 6, 5, 0, 0],
        [8, 7, 6, 0, 0],
    ];
    for from in 1..9 {
        let mut count = 0;
        for to in 0..10 {
            if can_shoot(from, to) {
                count += 1;
            }
        }
        let mut listed = 0;
        for i in 0..5 {
            let to = shots[from as u32][i];
            if to != 0 {
                listed += 1;
                assert(can_shoot(from, to));
            }
        }
        assert(count == listed);
        // every room can shoot into itself
        assert(can_shoot(from, from));
    }
}

#[test]
fn no_room_reaches_nothing() {
    for r in 0..10 {
        assert(!can_move(0, r));
        assert(!can_move(r, 0));
        assert(!can_shoot(r, 0));
        assert(!can_shoot(9, r));
    }
}
