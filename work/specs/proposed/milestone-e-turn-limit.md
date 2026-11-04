---
title: duel-in-the-dark, milestone E (a turn limit, and draws)
type: spec
status: proposed
created: 2026-11-03
extends: work/specs/accepted/milestone-d-full-card-game.md
decides-with: template-zk-game work branch (docs/plans/zk-game-framework.md, ADR-0003)
touches: branch `turn-limit` (contracts/, web/, README.duel.md), and template-zk-game `main` for the generic part
---

# Spec: a match lasts at most 30 turns

## The rule

A match has at most `maxTurns` turns, 30 for this deployment, so each player gets 15. If nobody has taken two hits when the 30th turn ends, the match ends: whoever has taken fewer hits wins and takes both stakes; with equal hits it is a tie, and each player gets their own stake back.

No circuit changes. The turn counter is already public state, and the outcome is a comparison of public state (`hits`), like `chargeDue`. The contract evaluates it; a later channel close computes the same thing from a co-signed state (the milestone after this one is what the limit is for: it bounds the cost of finishing a match on chain, and so the bond).

## The value: 30, a deploy parameter

**Why 30.** There is no record of real matches yet, so I simulated them: 20,000 matches per profile between bots that track a probability distribution over the opponent's room (moves diffuse it, revealed rooms collapse it, a listen answer conditions it, a miss removes the room), and choose between shooting, detonating a trap, the Motion Tracker, listening, setting a trap and moving toward the best shot. Three profiles (aggressive, balanced, cautious) only differ in the confidence they need before shooting or listening. The script is a throwaway and simplifies the rules (no purge, chute, charge or Stim), so these are an order of magnitude, not a prediction.

| profile | median | p75 | p90 | p95 | p99 | proven actions per turn |
| --- | --- | --- | --- | --- | --- | --- |
| aggressive | 13 | 18 | 24 | 28 | 37 | 2.8 |
| balanced | 12 | 18 | 23 | 28 | 36 | 3.1 |
| cautious | 15 | 21 | 27 | 32 | 42 | 3.1 |

| limit | matches reaching it (balanced / cautious) | of all matches, ending in a tie |
| --- | --- | --- |
| 20 | 16% / 28% | 9% / 15% |
| 24 | 9% / 16% | 5% / 9% |
| 30 | 3% / 6% | 2% / 4% |
| 36 | 1% / 2% | 1% / 2% |

30 is about the 95th percentile: the limit should be a backstop that rarely decides a match, not a clock that shapes every one, and humans who track the ship less well than these bots will play longer matches than they do. Each extra turn adds to the bond in the next milestone (up to about 11 proofs per turn in the worst case, about 3 on average), so going higher costs money. At a minute or two per turn, 30 turns is a 30 to 60 minute match.

**A deploy parameter.** `Duel` takes `maxTurns` in its constructor (an immutable, read through a public getter), and `002_deploy_duel.ts` sets `MAX_TURNS = 30` and records it in `linkedData`, like the durations. Not a constant, so tuning it after real matches is a redeploy with no code change; not chosen per match at `createMatch`, because the bond is sized from it and one value per deployment keeps the bond one number too. The hook below takes the `matchId`, so a per-match limit later needs no framework change.

## When it applies

At the end of turn 30, which in ZKMatches is the moment turn 31 would start: `_settle` after the action that leaves nothing to do in the turn, or `endTurn`. Both go through one private `_nextTurn` that finishes the match instead of starting turn 31. It happens in the same transaction as the last action, so nobody has to call anything, and turn 31 never exists (`turn` stays 30).

Because the limit replaces the start of a turn, everything that already holds a turn open still does:

- **A query opened in turn 30** (a shot, a listen, a trap going off...) is answered as usual. A hit in that answer can still end the match by the ordinary rule: a second hit wins outright, before the limit is considered.
- **The free move after a shot** is still owed: `_turnMayEnd` is false until it is made, so the turn, and with it the match, waits for it. It is pointless on the last turn, but it is the rule, and the UI asks for it as always.
- **A Remote Charge due at the start of turn 29 or 30** goes off first, as always.
- **A Remote Charge set in turn 29 or 30** would go off at its setter's next turn, which never comes, so it never goes off. That is just what the rules say; nothing special is done about it. The UI labels the action "it would never go off" in the setter's last turn (the circuits still allow it).
- **Ending a turn early** (`endTurn`) on turn 30 ends the match.

## Timeouts on the last turn: unchanged

Whoever is being waited for loses, as on every other turn, whatever the hits. Ending on hits instead would reward refusing to answer: leading 1 to 0, a player shot at in turn 30 would rather time out (a 1 to 0 win) than answer the hit (a tie). A turn holder who is ahead loses nothing by ending the turn properly, so only someone who stalls is ever timed out.

## The generic part (template-zk-game first)

ZKMatches gains a draw and a turn limit, decided by game hooks:

- `uint8 internal constant NO_WINNER = type(uint8).max`.
- `_finish(matchId, winner, byTimeout)` accepts `NO_WINNER`: a draw credits each seat its own stake instead of the pot to one, sets `winner = NO_WINNER`, and emits `MatchFinished` with `player = address(0)`. One function and one event, rather than a second pair, because the contract is near the size limit and a reader already checks `winner`.
- `_turnLimit(matchId) returns (uint24)`, virtual, default 0: no limit.
- `_outcomeAtTurnLimit(matchId) returns (uint8 winner)`, virtual, default `NO_WINNER`.
- `_nextTurn(matchId)` (private), used by `_settle` and `endTurn`: if a limit is set and `turn >= limit`, `_finish(matchId, _outcomeAtTurnLimit(matchId), false)`, else start the other seat's turn.

HideAndSeek takes a `maxTurns` constructor argument returned by `_turnLimit`, 0 in its deploy script, and keeps the default outcome (nobody found: a draw). Tests in the template: with the default deploy, a match runs past turn 40 by `endTurn` and plays exactly as before; a second deployment with a limit of 4 ends in a draw at the end of turn 4 with both stakes refunded and withdrawable, a guess opened in turn 4 is answered before the draw, and a hit on that answer still wins outright. README.zk-game.md's framework paragraph gains a sentence on the limit and draws. Then merged down into `turn-limit` with `git fetch stem main && git merge stem/main`.

## Duel

- `maxTurns` immutable and getter; `_turnLimit` returns it; `_outcomeAtTurnLimit` returns the seat with fewer hits, `NO_WINNER` on equal hits.
- Nothing else: no new state, no change to `act`.
- Size: Duel is 23,564 of 24,576 bytes unoptimised; this adds a few hundred. If it no longer fits, the next milestone's router split is the real answer; for this milestone I would ask before turning on the optimiser in the test profile.

## UI

- The match panel shows "Turn 7 of 30", and "Your last turn" or "Their last turn" on turns 29 and 30 (a turn is the last of its holder when `turn + 2 > maxTurns`).
- Remote Charge in the setter's last turn: the button says it would never go off.
- The result, from `status`, `winner`, the hits and the `MatchFinished` event's `byTimeout` (read alongside `Acted`): "You won: two hits." / "You won on hits, 1 to 0, at the turn limit." / "A tie at the turn limit (1 to 1): both stakes refunded." / "You won: they ran out of time." and the losing forms. The history panel ends with the same line.
- `maxTurns` is read once per deployment with the matches; `MatchSummary` carries it.

## README.duel.md

One sentence after "Two hits lose...": "A match lasts at most 30 turns, 15 each: if nobody has lost by then, whoever has taken fewer hits wins, and equal hits are a tie that gives both stakes back." The deadline paragraph gains "(the last turn too)". Nothing else changes in the rules.

## Tests

- Contracts (template): as above.
- Contracts (Duel, real proofs; reaching turn 30 is mostly `endTurn`, about 47k gas each, so it stays fast): a hit early then turns ended to the limit gives a win on hits to the player hit less, with the pot withdrawable; no hits gives a tie with both stakes refunded and withdrawable; a 1 to 1 tie; a shot in turn 30 that hits for 1 to 0 ends the match only after the free move, in the same transaction as that move, on hits; a second hit in turn 30 wins outright (`phase == OVER`); `act` and `endTurn` after the limit revert `NotActive`; a responder who does not answer in turn 30 loses by timeout even when ahead on hits; `turn` is still 30 after the limit; the gas of the transaction that hits the limit is recorded.
- Web unit: turns left and "last turn" for both seats; the result lines for each way a match ends; the late Remote Charge label.
- e2e: not extended (reaching turn 30 in a browser is long and adds nothing the contract and unit tests do not cover).
