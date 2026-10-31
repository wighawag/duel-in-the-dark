---
title: duel-in-the-dark on template-zk-game, milestone C (parity with the 2023 demo)
type: spec
status: accepted
created: 2026-10-31
decides-with: template-zk-game work branch (docs/plans/zk-game-framework.md, ADR-0001, ADR-0002, ADR-0003)
touches: branch `noir` (circuits/, contracts/, web/)
---

# Spec: duel-in-the-dark at parity, on Noir

This branch is not part of the main working tree. Read a file with `git show work:<path>`.

Built on branch `noir` (2026-10-31): circuits, contract, web and every test layer as specified below, with one difference: in Solidity the `sealed` field is named `sealedRoom` (`sealed` is a reserved word), and so in TypeScript, which mirrors the contract's struct.

## Scope

Parity with the 2023 demo, rebuilt on template-zk-game: the ship map; a hidden starting room proven valid; Move (hidden, proven adjacent); Shoot (reveal, shoot-list check, the opponent's proven hit-or-miss answer as a ZKMatches query, then the shooter's forced free move); 2 action points per turn; 2 hits to win; ETH stake and payout; deadlines and `claimTimeout`; the ship SVG in Svelte; a lobby; backup and restore of hidden state.

Out of scope, but the state below is shaped to hold them without a redesign: Listen, traps (set, detonate, at most two), Remote Charge, room effects, the Engine Room seal (milestone D); the state channel (later).

The rules are inspired by the card game *Revolver Noir* (Xavier Davidson, Button Shy). Nothing of its rules text is reproduced here or in code.

## The ship (public map data)

Rooms are numbered 1..8, as in the old SVG. 0 always means "no room".

| room | name | deck | moves to | can shoot into |
| --- | --- | --- | --- | --- |
| 1 | Cryo Bay | upper | 2, 5 | 1, 2, 4 |
| 2 | Bridge | upper | 4, 1, 3 | 2, 4, 1, 3 |
| 3 | Science Lab | upper | 2, 8 | 3, 2, 4 |
| 4 | Observation Gantry | upper | 2, 7 | 4, 2, 7, 5, 6 |
| 5 | Galley | lower | 1, 6, 7 | 5, 6, 7 |
| 6 | Mess Hall | lower | 7, 5, 8 | 6, 7, 5 |
| 7 | Cargo Hold | lower | 4, 8, 5, 6 | 7, 6, 5 |
| 8 | Engine Room | lower | 7, 6, 3 | 8, 7, 6 |

Both tables are DIRECTED ("from this room, to these"), so nothing in the design assumes symmetry: the shoot table is not symmetric (the Gantry sees rooms that cannot see it), and the map may gain one-way paths later. The milestone C move table happens to be symmetric, and a test pins that as a fact about THIS map's data, to be dropped if the map changes. Both tables are written ONCE in Noir (`circuits/duel/src/ship.nr`, as 8-bit masks per room: bit r-1 set when room r is reachable) and once in TypeScript for the UI (`circuits/src/duel.ts`), and a TypeScript test executes the move and shoot circuits (witness only, no proving) for all 64 room pairs and checks each is accepted exactly when the TypeScript table says so, so the two cannot drift. Solidity never needs the map.

## Hidden state (private, per seat)

```
struct Hidden {
    room: u8,        // 1..8
    traps: [u8; 2],  // rooms with a trap set, 0 = none          (milestone D, always 0 in C)
    charge: u8,      // room of the Remote Charge, 0 = none      (milestone D, always 0 in C)
}
```

The commitment uses the template's one scheme, unchanged: `commit(pack(hidden), salt)` = Poseidon2(packed, salt), with

```
pack(h) = h.room + 2^8 * h.traps[0] + 2^16 * h.traps[1] + 2^24 * h.charge
```

Every slot is a `u8`, so `pack` is injective and the circuit needs no bit decomposition (it packs range-checked bytes; it never unpacks). Milestone D fills slots that already exist, so the commitment layout, the start circuit's statement and every stored commitment keep their meaning. Further slots (up to 31 bytes in one field) can be appended the same way if D finds a need. A fresh random salt on every transition, so equal states never produce equal commitments.

A pinned test on each side (`duel_commitment_is_stable` in Noir, its twin in TypeScript) fixes one packed commitment, as the template does for `commit`.

## Public state (what every transition circuit sees, in and out)

```
struct State {
    commitments: [Field; 2], // seat 0, seat 1
    hits: [u8; 2],           // hits TAKEN by each seat
    actor: u8,               // the turn holder (ZKMatches.turnSeat)
    ap: u8,                  // action points left (ZKMatches.actionPoints)
    phase: u8,               // see below
    arg_a: u8,               // pending-action data (C: the shooter's revealed room)
    arg_b: u8,               // pending-action data (C: the room shot at)
    sealed: u8,              // room sealed by Coolant Purge, 0 = none (milestone D, always 0 in C)
}
```

10 field elements. Phases:

| phase | value | who must act | meaning |
| --- | --- | --- | --- |
| PLAY | 0 | actor | spend action points, or end the turn |
| SHOT | 1 | the other seat | a shot at `arg_b` from room `arg_a` awaits its proven answer (a ZKMatches query) |
| MOVE_AFTER_SHOT | 2 | actor | the shooter owes the free move out of `arg_a` |
| OVER | 3 | nobody | the actor's last action gave the other seat its second hit |

Milestone D adds phases (listen answer owed, detonation answer owed, start-of-turn obligations such as the Remote Charge going off) and uses `arg_a`, `arg_b`, `sealed`; none of that changes the struct.

`ap` and `actor` are in the state on purpose: the circuits check the AP cost of each action (Move 1, Shoot 2, the forced move 0, Stim Rations later grants), so the rules are in Noir, and ZKMatches only counts and passes turns.

## Circuits: one per action, each a whole-state transition

Workspace members (`circuits/Nargo.toml`):

- `duel` (library): `Hidden`, `State`, `pack`, the ship tables, the phase constants, and `transition` helpers. Depends on `commitment`.
- `duel_start`: `main(commitment: pub Field, hidden, salt)`. The commitment opens a valid starting state: `room` in 1..8, no traps, no charge. Used by `createMatch` and `joinMatch` (the ZKMatches hook `_validateInitialCommitment`). Not a transition: a match's initial state is fixed by the framework.
- `duel_move`: `main(state: pub State, next: pub State, hidden, salt, new_hidden, new_salt)`.
  - Phase PLAY: `state.ap >= 1`; `next.ap = state.ap - 1`.
  - Phase MOVE_AFTER_SHOT: `hidden.room == state.arg_a` (the revealed room); `next.ap = state.ap` (free); `next.phase = PLAY`, `next.arg_a = next.arg_b = 0`.
  - Both: `commit(pack(hidden), salt) == state.commitments[actor]`; `new_hidden.room` adjacent to `hidden.room`; the other hidden slots unchanged; `next.commitments[actor] = commit(pack(new_hidden), new_salt)`; every other field of `next` equals `state`.
  - The ordinary move and the forced move are one circuit because they are one action at two prices; one verifier fewer to deploy.
- `duel_shoot`: `main(state: pub State, next: pub State, hidden, salt)`. Phase PLAY, `state.ap >= 2`; the actor's commitment opens to `hidden`; `next.arg_a == hidden.room` (the reveal, proven); `next.arg_b` in the shoot list of `hidden.room`; `next.phase = SHOT`; `next.ap = state.ap - 2`; everything else unchanged. The commitment does not change: the shooter is still in the revealed room until the forced move.
- `duel_answer_shot`: `main(state: pub State, next: pub State, hidden, salt)`. Phase SHOT; the RESPONDER's (`1 - actor`) commitment opens to `hidden`; `hit = (hidden.room == state.arg_b)`; `next.hits[responder] = state.hits[responder] + hit`; `next.phase = OVER` if that reaches 2, else MOVE_AFTER_SHOT; everything else unchanged. A lie in either direction has no witness.

Every transition circuit asserts EVERY field of `next`, so `next` has no free field: given `state` and the witness, at most one `next` verifies. That is what makes it a whole-state transition, and what a later state channel needs: a co-signed `State` plus one proof decides a dispute, without any duel rule in Solidity.

An answer may change the responder's commitment (milestone D's Maintenance Chute moves the opponent silently); the pattern already allows it, since `next.commitments` is fully asserted and only the circuit says which slot may change.

Nargo tests per circuit: every legal case, plus each way to cheat (non-adjacent move, staying put, moving from a room other than the revealed one, shooting out of range, shooting with 1 AP, lying about a hit or a miss, wrong salt, any tampered `next` field, acting in the wrong phase).

## Verifier public inputs

Noir orders public inputs by parameter order, struct fields in declaration order, arrays flattened. So for `duel_move`, `duel_shoot` and `duel_answer_shot` alike, the verifier gets 20 inputs:

```
[ 0] state.commitments[0]   [10] next.commitments[0]
[ 1] state.commitments[1]   [11] next.commitments[1]
[ 2] state.hits[0]          [12] next.hits[0]
[ 3] state.hits[1]          [13] next.hits[1]
[ 4] state.actor            [14] next.actor
[ 5] state.ap               [15] next.ap
[ 6] state.phase            [16] next.phase
[ 7] state.arg_a            [17] next.arg_a
[ 8] state.arg_b            [18] next.arg_b
[ 9] state.sealed           [19] next.sealed
```

and `duel_start` gets 1: `[commitment]`.

`state` (inputs 0..9) is ALWAYS built by the contract from storage: commitments from ZKMatches' seats, `actor` and `ap` from ZKMatches' match, `hits`, `phase`, `arg_a`, `arg_b`, `sealed` from Duel's own per-match struct. Only `next` comes from the caller, and it is the claimed result, bound by the proof. A test feeds each verifier a correct proof with each of the 10 `state` inputs perturbed in turn and expects a revert.

## Contract: `Duel is ZKMatches, Proxied`

Storage beyond ZKMatches, one slot per match:

```
struct Board { uint8[2] hits; uint8 phase; uint8 argA; uint8 argB; uint8 sealed; }
mapping(uint256 matchId => Board) public boards;
```

Actions, all for `player` through delegation as ZKMatches does:

- `createMatch` / `joinMatch` (inherited, payable): `_validateInitialCommitment` verifies `duel_start` against `[commitment]`.
- `move(matchId, player, State next, proof)`, `shoot(...)`, `answerShot(...)`: the same internal `_transition(matchId, player, verifier, next, proof)`:
  1. Who may act is read from `phase`: SHOT calls `_requireResponder`, every other phase `_requireTurn`. (PLAY and MOVE_AFTER_SHOT are both the turn holder's; the circuit decides which actions each phase allows.)
  2. Build `state` from storage, encode `[state, next]`, `_verify`.
  3. Apply `next` through the framework, never by writing ZKMatches fields directly: `_setCommitment` for a seat whose commitment changed; `_spendActionPoints(state.ap - next.ap)` (or `_grantActionPoints` when D makes it grow); store `hits`, `phase`, `arg_a`, `arg_b`, `sealed`; entering SHOT calls `_openQuery(1 << responder)`, leaving it calls `_answered(responder)`; entering OVER calls `_finish(actor, false)` (only the acting turn holder's action can end the match in C and in D: traps never hit their setter).
  4. `_settle`.
- `endTurn` (inherited): only in phase PLAY.
- `claimTimeout`, `cancelMatch`, `withdraw` (inherited, unchanged). In SHOT a query is open, so the responder loses a timeout; in PLAY and MOVE_AFTER_SHOT the turn holder does.
- Events: `Shot(matchId, seat, fromRoom, targetRoom)`, `ShotAnswered(matchId, seat, hit)`, `Moved(matchId, seat)`, for the UI and an indexer.
- `getBoard(matchId)` returns the full `State` as the circuits see it, so a client proves against exactly what the contract will build.

### One generic change to ZKMatches (goes up to template-zk-game)

The forced move breaks an assumption in `_settle`: after a shot is answered the turn holder has 0 AP and nothing is awaited, yet the turn must not pass. Proposed for the template, not duel only: a virtual hook

```
function _turnMayEnd(uint256 matchId) internal view virtual returns (bool) { return true; }
```

consulted by `_settle` (the turn passes only if it also returns true) and by `endTurn` (reverts `TurnNotOver` otherwise). Duel returns `phase == PLAY`. Any game with an obligation inside a turn (D's start-of-turn Remote Charge is the next one) needs the same. It is landed in template-zk-game first, with a HideAndSeek test that the default changes nothing, and merged down.

## Web

- `web/src/lib/duel/app.ts` is the `$app-specific` module (`svelte.config.js` alias repointed): `operationScope` and `delegationRegistry` are the Duel contract; `onchainState` polls recent matches with their `Board`.
- Route `/duel`: lobby (create with a stake and a chosen starting room, join an open match picking a room, cancel), match view, withdraw, backup and restore. Logic in `.ts` (`routes/duel/lib/{game,view,secrets,send}.ts`), the page renders stores.
- `Ship.svelte`: the old SVG's eight room polygons, ported. Colours: your room; rooms you can move to (clickable in move mode); rooms you can shoot (clickable in shoot mode); the opponent's last revealed room and the room shot at. Room names as labels. Pure helpers (`fillFor(room, view)`) in a `.ts` with unit tests.
- The client side (`circuits/src/duel.ts`, shared by web and contract tests as `hide-and-seek.ts` is): `start(room)`, `move(state, secret, to)`, `shoot(state, secret, target)`, `answerShot(state, secret)`, each returning `{next, secret?, proof}`; it computes `next` with the same rules so the caller never assembles it by hand, and the circuit is the judge.
- Secrets: as the template, stored under their commitment BEFORE sending, scoped by chain, contract and player, with export and import. A secret is `{room, traps, charge, salt, commitment}`.
- Answering a shot is a button the responder presses (it proves in the browser), as in /hide-and-seek, so a timeout stays a real possibility to test.

## What is dropped from the template (listed in .offshoot-omissions with reasons)

HideAndSeek's contract, deploy script, tests, its two circuits (`move_on_ring`, `answer_guess`) with their generated artifacts and verifiers, `web/src/lib/game/` (replaced by `web/src/lib/duel/`), the `/hide-and-seek` route, its unit and e2e tests. Kept: `in_range` and the `/zk` demo, which test the template's plumbing rather than a game, cost one verifier deployment, and dropping them would only turn every template change to them into a conflict. Renamed: package names `template-zk-game*` to `duel-in-the-dark*`.

## Tests

- Noir: per circuit, as listed above.
- Prover (node): each action proves and verifies; the TypeScript `next` equals what the circuit accepts; the commitment pin; the ship tables agree with the circuit.
- Contracts (real proofs): whole matches to a 2-hit win and the payout; a miss then the forced move; lies (deny a hit, claim a false hit), a forged move (non-adjacent, proof for a different state), a shot out of range, shooting with 1 AP, acting out of turn, answering when not awaited, ending the turn before the forced move; both timeouts (turn holder idle; responder silent) and the one after a shot (shooter never moves); a replayed proof; withdrawal by a delegate refused. Gas recorded per action in a finding.
- Web unit: view and ship helpers, secret store.
- e2e: two players in two browser contexts play a full match to a win through `scripts/run-e2e-tests.sh`.

## Expected cost

About 3.5 to 4 M gas per proven action (the template's measurement), so a shot costs three proofs (shoot, answer, forced move), roughly 11 to 12 M gas, and a move one. 20 public inputs instead of 2 or 3 should add little; it is measured, not assumed.

## Choices made (2026-10-31)

1. **The forced move is its own proof, after the answer** (3 proofs per shot), as the card game plays it: the shooter knows whether they hit before choosing where to go. Hence the `_turnMayEnd` hook. Rejected: folding it into the shot's proof (2 proofs, but the shooter commits to the escape before the answer).
2. **The starting room is chosen by the player, any of 1..8**, as the card game does.
3. **`in_range` and `/zk` are kept**, HideAndSeek is dropped.
