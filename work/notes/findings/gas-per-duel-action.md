# Gas per duel action, and the size of the Duel contract

Measured 2026-10-31 on branch `noir` (default, unoptimised compiler profile; EDR; `contracts/test/js/Duel.test.ts` prints the table on every run).

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

So 20 public inputs (the whole before and after state) cost about 150k gas more than the 1-input start proof: the whole-state design is nearly free on chain. A shot is three proofs, about 11.15 M gas; a turn of two moves is 7.4 M.

The circuits are small (2^9 gates for the transitions), so proving in the browser takes well under a second; the e2e plays a whole match in about a minute.

The Duel contract is 23,039 bytes deployed unoptimised (16,679 with the production profile), against the 24,576 limit. It is mostly ZKMatches and UsingDelegation (template-zk-game's HideAndSeek is 19,670 unoptimised), so milestone D's extra logic must stay small in Solidity, which the circuit-is-the-rules design already wants, or the test profile will need the optimiser.
