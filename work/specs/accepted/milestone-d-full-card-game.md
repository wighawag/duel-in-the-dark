---
title: duel-in-the-dark, milestone D (the full card game, on chain)
type: spec
status: accepted
created: 2026-10-31
extends: work/specs/accepted/milestone-c-noir-parity.md
decides-with: template-zk-game work branch (docs/plans/zk-game-framework.md milestone D, ADR-0003)
touches: branch `milestone-d` (circuits/, contracts/, web/), and template-zk-game `main` for one generic change
---

# Spec: the full card game, every action a whole-state transition

## Scope

Listen; traps (set, detonate, at most two); the six room effects; the Engine Room seal and its expiry; start-of-turn obligations. All played on chain through ZKMatches; every action a Noir circuit proving `state -> next` with every field of `next` asserted.

Out of scope: the state channel (every choice below keeps "a co-signed `State` plus one proof" sufficient for a dispute), 3-4 players, any change to the map.

Inspired by *Revolver Noir* (Xavier Davidson, Button Shy). Nothing of its text is reproduced here or in code.

## The rules, as this game states them

2 AP per turn (3 with Stim Rations). Rooms 1..4 are the upper deck, 5..8 the lower. "Adjacent to r" always means the move table's list FROM r (directed).

| action | AP | reveals | query to the opponent |
| --- | --- | --- | --- |
| Move | 1 | nothing | no |
| Forced move after a shot | 0 | nothing | no |
| Shoot | 2 | actor's room, target | hit or miss |
| Listen | 1 | nothing | name one room adjacent to yours |
| Set trap | 1 | nothing | no |
| Detonate trap | 1 | the trap's room | hit or miss |
| Coolant Purge (from 1) | 1 | room 1 | in 8: hit and move out; 8 is sealed |
| Maintenance Chute (from 3) | 1 | room 3 | in 5: drop to 8 silently; if 8 is sealed, hit and move out |
| Drop Down (from 4) | 0 | rooms 4 and 5 | no |
| Stim Rations (in 5) | 0, grants 1 | room 5 | no |
| Motion Tracker (from 7) | 0 | room 7 | a listen, but the exact room if on the upper deck |
| Remote Charge (from 8) | 1 | room 8 | no (the charge's room stays hidden) |
| Remote Charge goes off | 0, forced | the charge's room | hit or miss |

Nobody is hit by their own trap or charge: only the opponent answers. Every hit in D lands on the responder, so only the turn holder's action can end a match, as in C.

## Hidden state: unchanged

`Hidden {room, traps: [u8; 2], charge}`, packed and committed exactly as in C; D fills `traps` and `charge`. `duel_start` and the pinned commitment do not change.

## Public state: six fields appended

```
struct State {
    commitments: [Field; 2], hits: [u8; 2], actor: u8, ap: u8,   // C, unchanged
    phase: u8, arg_a: u8, arg_b: u8,                              // C, renumbered phases (below)
    sealed: u8,        // room sealed by a Coolant Purge, 0 = none; only in force while seal_active
    turn: u32,         // the turn number, from ZKMatches (the generic change)
    acted: u32,        // the turn in which the turn holder last took an action of their own (a Remote Charge going off does not count)
    sealed_turn: u32,  // the turn `sealed` was set in
    tracked: u32,      // the turn the Motion Tracker was last used in
    armed: u8,         // bit s set while seat s has a Remote Charge set
    last: u8,          // the action that produced this state (see History)
}
```

16 fields, so 32 public inputs per transition circuit (40 in the verifier), up from 20. In C, 19 extra inputs cost about 150k gas, so this should add about 100k per action; to be measured. Each `<Name>Verifier.sol` holds only its key, so its size should not move; checked after the build.

Predicates, written in Noir and mirrored in TypeScript for the UI:

- `fresh(s) = s.acted != s.turn`: the turn holder has not acted yet this turn.
- `seal_active(s) = s.sealed != 0 & s.turn <= s.sealed_turn + 1`: the rest of the purger's turn and the opponent's whole next turn.
- `charge_due(s) = armed bit of s.actor & fresh(s)`.

Why counters and not a "start of turn" phase: a turn starts inside ZKMatches (`_settle`, `endTurn`) with no proof, so nothing in Noir runs at that moment, and a turn can pass with no action at all. A public turn number lets every circuit compute "start of my turn" and "seal still on" from the state alone: no rule in Solidity, nothing to reset.

## Phases

Renumbered so the contract needs one fact about them: a phase from `QUERY` (16) up is answered by the other seat.

| phase | value | meaning of `arg_a`, `arg_b` |
| --- | --- | --- |
| PLAY | 0 | the last action's public data (History) |
| MOVE_AFTER_SHOT | 1 | the shooter owes the free move out of `arg_a` |
| OVER | 2 | |
| SHOT | 16 | from `arg_a`, into `arg_b` |
| LISTEN | 17 | |
| DETONATION | 18 | the trap's room in `arg_b` |
| CHARGE | 19 | the charge's room in `arg_b` |
| PURGE | 20 | 1, 8 |
| CHUTE | 21 | 3, 5 |
| TRACKER | 22 | 7 |

After an answer: SHOT goes to MOVE_AFTER_SHOT, every other query to PLAY, a second hit to OVER.

## Circuits: six, grouped by witness

One circuit per action would be 14 circuits and verifiers for witnesses of a handful of shapes. Grouped by what the prover holds and what changes, each grouped circuit takes a PRIVATE `action` input selecting the rule. Which action was taken stays public, because the circuit writes it into `next.last`. The contract does not care which circuit a proof came from: each accepts only legal transitions.

| circuit | actions | witness | commitment |
| --- | --- | --- | --- |
| `duel_start` | unchanged | hidden, salt | |
| `duel_move` | Move, forced move, Drop Down | hidden, salt, new_hidden, new_salt, action | actor's, new |
| `duel_shoot` | Shoot | hidden, salt | unchanged |
| `duel_trap` | Set trap, Detonate, Remote Charge, its going off | hidden, salt, new_hidden, new_salt, action, room | actor's, new |
| `duel_effect` | Listen, Purge, Chute, Stim Rations, Motion Tracker | hidden, salt, action | unchanged |
| `duel_answer` (replaces `duel_answer_shot`) | every answer | hidden, salt, new_hidden, new_salt, reveal | responder's, unchanged or new |

Every actor circuit asserts `!charge_due(state)` (except the charge going off, which requires it) and sets `next.acted = state.turn` (except the charge going off). Every action sets `arg_a`, `arg_b` to its own public data, 0 when it has none.

Checked per action, beyond "the actor's commitment opens, the AP suffice, the phase allows it":

- **Move** (PLAY): adjacent; not into `sealed` while `seal_active`; traps and charge unchanged.
- **Forced move** (MOVE_AFTER_SHOT): as in C; never a Drop Down.
- **Drop Down** (PLAY, 0 AP): room 4 to room 5.
- **Shoot**: as in C.
- **Listen** (1 AP): opens LISTEN; the actor's commitment is not opened (no secret is used).
- **Set trap** (1 AP): the current room into a slot; never two traps in one room; with both slots full, the private `room` names the trap it replaces (removing and setting in one proof). Reveals nothing.
- **Detonate** (1 AP): `room` is one of the actor's traps; that slot becomes 0; opens DETONATION.
- **Remote Charge** (1 AP): actor in 8; no charge set; `room` in 1..7 becomes `charge`; sets the actor's `armed` bit.
- **Remote Charge goes off** (0 AP, only when `charge_due`): reveals `charge`, clears it and the `armed` bit; opens CHARGE.
- **Coolant Purge** (1 AP): actor in 1; `sealed = 8`, `sealed_turn = turn`; opens PURGE.
- **Maintenance Chute** (1 AP): actor in 3; opens CHUTE.
- **Stim Rations** (0 AP): actor in 5; `fresh`; `ap + 1`.
- **Motion Tracker** (0 AP): actor in 7; `tracked != turn`; `tracked = turn`; opens TRACKER.
- **Answer** (by `1 - actor`, whose commitment opens; it never touches traps or charge):
  - SHOT, DETONATION, CHARGE: hit iff `room == arg_b`; commitment unchanged.
  - PURGE: hit iff `room == 8`; on a hit, `new_hidden.room` adjacent to 8 (3, 6 or 7) in the same proof; on a miss, commitment unchanged.
  - CHUTE: if `room == 5` the room becomes 8, and if `seal_active` that is a hit and the room must then move on to 3, 6 or 7; otherwise the room stays. The commitment is ALWAYS replaced with a fresh salt, so a silent drop and "was not in the Galley" look the same.
  - LISTEN: `reveal` adjacent to `room`; `arg_a = 0`, `arg_b = reveal`.
  - TRACKER: on 1..4, `reveal == room` and `arg_a = 1` (exact); otherwise as LISTEN. The flag is needed because a lower-deck listen can name an upper-deck room (5 to 1, 7 to 4, 8 to 3).

Nargo tests per circuit: every legal case and every cheat: an effect from the wrong room; no AP; wrong phase; acting while a charge is due; Stim after acting or outside 5; Drop Down from elsewhere or as the forced move; a third trap without replacing; two traps in one room; detonating a room without a trap; a second charge; a charge into 8; the charge going off when not due; Tracker twice in a turn; entering a sealed 8 (and entering it after expiry, legal); every answer's lie both ways; a purge or chute forced move that stays in 8 or jumps; a listen answer that is not adjacent; a "not exact" tracker answer from the upper deck; a tampered value in each `next` field.

## Contract

`Duel` still holds no rule. Changes:

- **One entry point** `act(matchId, player, uint8 circuit, State next, bytes proof)` replaces `move`, `shoot`, `answerShot`; `circuit` picks one of five verifier immutables. Letting the caller pick is safe since each verifier accepts only legal transitions, and `next.last` (proven) says what happened. It is also what keeps the contract under the size limit (23,039 of 24,576 bytes): eight more external functions would not fit.
- **Who acts**: `phase >= QUERY` is `_requireResponder`, anything else `_requireTurn`. Entering a query phase opens a query to the other seat, leaving one is `_answered`.
- **AP**: spend or grant the difference (Stim Rations is the first grant).
- **`_turnMayEnd`**: `phase == PLAY && !chargeDue`, the same public predicate as in Noir. This is the only duel predicate evaluated in Solidity; it reads public state only, and it is what makes the charge a start-of-turn obligation: the turn cannot end or pass, so ignoring the charge times out the turn holder.
- **Board** stores hits, phase, arg_a, arg_b, sealed, acted, sealed_turn, tracked, armed, last (one slot). `turn`, `actor`, `ap` come from ZKMatches.
- **One event** `Acted(matchId, seat, State next)` replaces `Moved`, `Shot`, `ShotAnswered`: the history is the sequence of states.

If the unoptimised contract still exceeds 24,576 bytes, the fallback is the optimiser in the test profile; I will ask before that.

## The one generic change (template-zk-game first)

**ZKMatches counts turns.** `Match` gains `uint24 turn` (filling its one slot exactly), incremented by `_startTurn` (the first turn is 1) and reported in `TurnStarted`. It lets a game express anything tied to turn boundaries (an effect until a player's next turn, something owed at the start of a turn, once per turn) as a function of public state, with no hook running at turn start. It is also the natural sequence number for a later channel. Landed in template-zk-game with a HideAndSeek test that a match plays as before and `turn` counts 1, 2, 3, then merged down into `milestone-d`.

Not moved up: forced moves inside an answer need no framework change (an answer can already replace the responder's commitment; the template README gains one sentence saying so); the seal and armed bits are Duel's own fields; the single `act` entry point is a pattern of whole-state games, not of ZKMatches, and stays in Duel until a second game wants it.

## History and the UI

`next.last` is the action code (MOVE, FORCED_MOVE, DROP_DOWN, SHOOT, LISTEN, SET_TRAP, DETONATE, SET_CHARGE, FIRE_CHARGE, PURGE, CHUTE, STIM, TRACKER, ANSWER) and `arg_a`, `arg_b` its public data; an answer's kind is the query phase it closed. The history is the list of `Acted` events, and a co-signed channel state carries the same information.

Web (logic in `.ts`, stores across the boundary, as in C):

- `circuits/src/duel.ts`: one client function per action, each computing `next` with the TypeScript mirror and returning `{circuit, next, secret?, proof}`.
- Match view: your room, traps and charge (from your secret); the sealed room while active; your AP; buttons only for what the state allows (effects in their room, Stim only when fresh, the charge alone when due); the pending query with an Answer button, choosing which adjacent room to name for a listen.
- History panel: one line per `Acted` event in plain words ("they listened; you named the Bridge", "their trap went off in the Galley: miss").
- Ship: the opponent's last revealed room, marked with how many of their actions ago; rooms named in listen answers marked "near". No possible-room inference in D.

## Open questions, each with a recommendation

1. **Listen when several rooms are adjacent**: the responder picks any room of their move list, and may repeat what is known. Drop Down is not adjacency, so a Gantry listen cannot name the Galley.
2. **Is a detonation a query**: yes; only the opponent knows whether they are there. A shot's shape without the forced move.
3. **Who answers, in which order, when an effect hits**: with two players, always the other seat, one query at a time; everything the effect does to them happens in that one answer proof. Nothing waits on two answers.
4. **"Must move" after a hit inside an answer**: in the same answer proof, chosen and hidden by the responder (out of 8 to 3, 6 or 7). Only the hit is public.
5. **Start-of-turn order**: the Remote Charge first, blocking everything else including ending the turn; then Stim Rations may still be claimed (the charge does not move you). Stim is an explicit 0 AP action that reveals the Galley, valid only before any other action of yours this turn; you may decline it.
6. **What a revealed room means for the UI history**: an event log in words, a "last seen, N actions ago" mark, "near" marks for listens.
7. **(new) Motion Tracker limit**: once per turn. Unlimited, each answer restarts the turn holder's clock, so a turn could last forever.
8. **(new) Traps**: only in your current room; never two in one room; with two set, the new one replaces one of your choice in the same action; detonate any of yours from anywhere, including the room you are in.
9. **(new) Remote Charge**: any room but the Engine Room; one at a time; hidden until it goes off.
10. **(new) Seal**: blocks entering room 8 by any move, ordinary or forced, for both players, until the purger's next turn starts. It does not block shooting into 8; the chute still drops into it (that is the hit). A purge with nobody in 8 still seals it and still needs the answer.

## Tests

- Noir: per circuit as listed; whole sequences in `duel/src/lib.nr` (a purge then a chute next turn; a charge set, going off, then Stim).
- Prover (node): every action proves and verifies through the client; the TypeScript `next` is what the circuit accepts; the table agreement extended to Drop Down, the decks and the listen relation (every room pair through `duel_answer`).
- Contracts (real proofs): every action and every answer; each cheat a real proof of another statement (another state, another circuit for the same state, a stale proof after the turn moved on); a due charge blocks `endTurn` and times out the turn holder; a silent responder times out on each query kind; Stim gives 3 AP; seal expiry across turns; each of the 16 `state` inputs perturbed is rejected. The gas table covers every action.
- Web unit: available actions, history lines, marks, the TypeScript predicates.
- e2e (`bash scripts/run-e2e-tests.sh duel`): two players; a trap set and detonated, a listen answered, Stim Rations (needs no luck with positions), and a shot to the win as in C.

## Expected cost

About 3.7 to 3.85 M gas per proven action. Listen, detonation, purge, chute, tracker and the charge going off are two proofs each (about 7.5 M); set trap, Remote Charge, Stim and Drop Down one.
