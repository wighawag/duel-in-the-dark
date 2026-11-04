# Gas per duel action, and the size of the Duel contract

Default, unoptimised compiler profile; EDR; `contracts/test/js/Duel.test.ts` prints the table on every run (maximum over the runs of each action).

## Milestone E, the turn limit (2026-11-03, branch `turn-limit`)

Proven actions are unchanged (within a few hundred gas of D). What is new:

| action | gas |
| --- | --- |
| endTurn that reaches the turn limit, a draw (two refunds credited) | 94,904 |
| the forced move that reaches the turn limit, a win on hits | 3,877,006 |

An ordinary `endTurn` is still about 47k. Duel is 24,359 of 24,576 bytes unoptimised (was 23,564): the turn limit fit, with 217 bytes left, so the channel milestone has to split the contract (routes) or turn on the optimiser.

## Milestone D (2026-10-31, branch `milestone-d`)

32 public inputs per transition (16 state fields before and after), every action through `act`.

| action | gas |
| --- | --- |
| createMatch (duel_start proof) | 3,585,601 |
| joinMatch (duel_start proof) | 3,552,708 |
| move | 3,866,420 |
| move, the free one after a shot | 3,854,454 |
| Drop Down | 3,862,411 |
| shoot | 3,751,923 |
| listen | 3,751,933 |
| set a trap | 3,753,780 |
| set a trap, replacing one | 3,736,752 |
| detonate | 3,739,965 |
| set the Remote Charge | 3,753,864 |
| the Remote Charge goes off | 3,738,708 |
| Coolant Purge | 3,751,993 |
| Maintenance Chute | 3,751,969 |
| Stim Rations | 3,748,848 |
| Motion Tracker | 3,750,820 |
| answer a shot | 3,877,594 |
| answer a listen | 3,848,719 |
| answer a detonation | 3,875,070 |
| answer a charge | 3,868,583 |
| answer a purge (hit, with the forced move) | 3,873,750 |
| answer a chute | 3,853,826 |
| answer a tracker | 3,848,671 |
| endTurn | 46,842 |
| claimTimeout | 60,952 |
| withdraw | 35,298 |

So every proven action costs 3.74 to 3.88 M gas, about 50k to 150k more than in milestone C for 12 more public inputs and the extra storage. A shot is still three proofs (about 11.5 M); a listen, a detonation, a purge, a chute, a tracker sweep and a Remote Charge going off are two (about 7.6 M); setting a trap or a charge, Stim Rations and the Drop Down one.

The Duel contract is 23,564 bytes deployed unoptimised (was 23,039), against 24,576. It got there only by: one `act` entry point instead of one function per action (eight more functions would not fit); the circuit-index constants internal (each public constant is a getter, about 60 bytes); an `Acted` event of scalars rather than the whole `State` (that cost about 700 bytes); and building the public inputs as `abi.encode(state, next)` reinterpreted as a `bytes32[]` (every `State` field is static, so the encoding is already one word per field in circuit order) instead of writing them one by one. The next addition to Duel will likely need the optimiser in the test profile.

## Circuit size: integers in the public state cost range checks

The first D build gave 2^12 to 2^13 gates per transition, against 2^9 in C. The four turn counters were `u32`: each integer input is range checked, and a 32-bit range check pulls in a large lookup structure, which dominated the circuits. The rules only ever compare them for equality (`acted != turn`, `turn == sealed_turn + 1`), so they are `Field`s now, and the `armed` bits are read and changed arithmetically (`0..3`, plus or minus the seat's bit) rather than with bitwise operators, which bring their own tables. Result: 2^9 to 2^10 (start 2^8; shoot, trap, effect 2^9; move, answer 2^10). Rule for later circuits: a public counter that is only compared for equality is a `Field`; avoid `&`, `|`, `<<`, `>>` on witnesses.

## Milestone C (2026-10-31, branch `noir`), for comparison

| action | gas |
| --- | --- |
| createMatch (duel_start proof) | 3,585,529 |
| joinMatch (duel_start proof) | 3,551,355 |
| move (duel_move proof) | 3,699,946 |
| move, the free one after a shot | 3,701,194 |
| shoot (duel_shoot proof) | 3,719,213 |
| answerShot (duel_answer_shot proof) | 3,732,088 |
| endTurn | 43,613 |
| claimTimeout | 60,953 |
| withdraw | 35,298 |

20 public inputs then cost about 150k gas more than the 1-input start proof. The circuits are small, so proving in the browser takes well under a second; the milestone D e2e plays a whole match (an effect, a trap, a listen, two shots) in under two minutes.
