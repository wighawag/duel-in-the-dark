# duel-in-the-dark

Alien against human, somewhere on a dark ship. Each player's room is hidden behind a commitment that nobody, the contract included, can open; every move is proven in zero knowledge, a shot gives the shooter's room away, and the target must answer with a proof of whether it was hit. Two hits lose, and the winner takes both stakes.

A digital take inspired by the card game *Revolver Noir* (Xavier Davidson, Button Shy), re-themed. The rules here are this game's own; nothing of the card game's text is reproduced.

It is built on [template-zk-game](https://github.com/wighawag/template-zk-game) (see [README.zk-game.md](./README.zk-game.md)): Noir circuits, a prover that runs in the browser, and the `ZKMatches` match framework.

## The ship

| room | name | moves to | can shoot into |
| --- | --- | --- | --- |
| 1 | Cryo Bay | 2, 5 | 1, 2, 4 |
| 2 | Bridge | 4, 1, 3 | 2, 4, 1, 3 |
| 3 | Science Lab | 2, 8 | 3, 2, 4 |
| 4 | Observation Gantry | 2, 7 | 4, 2, 7, 5, 6 |
| 5 | Galley | 1, 6, 7 | 5, 6, 7 |
| 6 | Mess Hall | 7, 5, 8 | 6, 7, 5 |
| 7 | Cargo Hold | 4, 8, 5, 6 | 7, 6, 5 |
| 8 | Engine Room | 7, 6, 3 | 8, 7, 6 |

Rooms 1 to 4 are the upper deck, 5 to 8 the lower. Both tables are directed ("from this room"), so a one-way path is just data.

## A turn

2 action points. **Move** (1): to an adjacent room, hidden and proven. **Shoot** (2): reveal your room and shoot into one it can see; the opponent answers with a proof (it cannot lie), then you make a free, hidden move out of the room you gave away. **End turn** passes what is left. Every wait has a deadline, after which anyone can end the match against whoever was being waited for.

## Where the rules live

In the circuits. `circuits/duel/src/lib.nr` holds the ship and one function per action, each a whole-state transition: the public match state before, the public state after, both public inputs of the proof, and every field of the after-state asserted. `contracts/src/Duel/Duel.sol` holds no duel rule: it builds the before-state from storage, takes the after-state from the player, verifies, and applies the difference through `ZKMatches`. That is what lets a later state-channel layer settle a dispute with one proof and two signatures.

| circuit | proves |
| --- | --- |
| `duel_start` | a valid starting room (any of the 8) behind a commitment |
| `duel_move` | a move to an adjacent room: 1 AP, or free right after a shot, out of the revealed room |
| `duel_shoot` | the shooter's room (revealed) and a target it can see: 2 AP |
| `duel_answer_shot` | the truthful hit or miss |

The hidden state also has slots for traps and a charge (always empty for now), so later rules fill a layout that already exists. The design, with every public input, is on the `work` branch: `git show work:work/specs/accepted/milestone-c-noir-parity.md`.

## Playing locally

`pnpm i`, then `pnpm start` (see below), and open `/duel/`. Changing a circuit needs `nix develop` (see README.zk-game.md).

## Cost

About 3.6 to 3.7 million gas per proven action (UltraHonk with zero knowledge), so a shot (shoot, answer, free move) is about 11 million. This belongs on an L2.
