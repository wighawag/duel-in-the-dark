# duel-in-the-dark

Alien against human, somewhere on a dark ship. Each player's room, traps and Remote Charge are hidden behind a commitment that nobody, the contract included, can open; every action is proven in zero knowledge, a shot or a room effect gives the player's room away, and whatever asks the other player something (a shot, a listen, a trap going off) is answered with a proof it cannot lie in. Two hits lose, and the winner takes both stakes. A match lasts at most 30 turns, 15 each: if nobody has lost by then, whoever has taken fewer hits wins, and equal hits are a tie that gives both stakes back.

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

2 action points (3 with Stim Rations). Each action is announced; only what the rules say is revealed.

- **Move** (1): to an adjacent room, hidden.
- **Shoot** (2): reveal your room and shoot into one it can see; the other answers hit or miss, then you make a free, hidden move out of the room you gave away.
- **Listen** (1): the other names a room next to its own (its choice, but it must be true).
- **Trap** (1): set one where you stand (two at most, in two rooms; a third replaces one), or set one off from anywhere, revealing its room: the other is hit if it is there, never you.
- **Room effects**, which reveal your room:
  - Cryo Bay, *Coolant Purge* (1): whoever is in the Engine Room is hit and must move out; the Engine Room is sealed until your next turn.
  - Science Lab, *Maintenance Chute* (1): whoever is in the Galley drops to the Engine Room, silently; if it is sealed, they are hit and move out.
  - Observation Gantry, *Drop Down* (0): straight to the Galley.
  - Galley, *Stim Rations* (0): start your turn here for a third action point.
  - Cargo Hold, *Motion Tracker* (0, once a turn): a free listen, but someone on the upper deck must name their exact room.
  - Engine Room, *Remote Charge* (1): a hidden charge in any other room, outside the two-trap limit; it goes off by itself at the start of your next turn, before anything else.
- **End turn** passes what is left.

Every wait has a deadline (the last turn's too), after which anyone can end the match against whoever was being waited for (a turn whose Remote Charge is due cannot end until it goes off).

## Where the rules live

In the circuits. `circuits/duel/src/lib.nr` holds the ship and one function per action, each a whole-state transition: the public match state before, the public state after, both public inputs of the proof, and every field of the after-state asserted. `contracts/src/Duel/Duel.sol` holds no duel rule: it builds the before-state from storage, takes the after-state from the player, verifies, and applies the difference through `ZKMatches`. That is what lets a later state-channel layer settle a dispute with one proof and two signatures.

| circuit | proves |
| --- | --- |
| `duel_start` | a valid starting room (any of the 8) behind a commitment |
| `duel_move` | a move (1 AP), the free move after a shot, or the Drop Down |
| `duel_shoot` | the shooter's room (revealed) and a target it can see: 2 AP |
| `duel_trap` | setting or setting off a trap, setting the Remote Charge, and its going off |
| `duel_effect` | a listen, and the Coolant Purge, Maintenance Chute, Stim Rations and Motion Tracker |
| `duel_answer` | the truthful answer to any of the above, including the move a hit forces |

The contract takes every action through one function, `act(matchId, player, circuit, next, proof)`, and emits `Acted` for each, which is the match's history. The design, with every public input, is on the `work` branch: `git show work:work/specs/accepted/milestone-d-full-card-game.md` (and its predecessor, `milestone-c-noir-parity.md`).

## Playing locally

`pnpm i`, then `pnpm start` (see below), and open `/duel/`. Changing a circuit needs `nix develop` (see README.zk-game.md).

## On a LAN box, with no internet

`nix build .#lan` packages the game for [ethereum-lan-node](https://github.com/wighawag/ethereum-lan-node): the static site, built for same-host urls (`web/.env.lan`: the chain at `//:8545`, the faucet at `//:34010`, a burner wallet in every browser), and `duel-deploy`, which the box runs to put the contracts on its chain. The build has no network: it compiles with the official solc 0.8.28 (WASM), deploys into a throwaway chain with the box's chain id to learn the addresses (`contracts/scripts/deploy-lan-build.ts`), and every contract goes through the CREATE2 factory the box's genesis predeploys, so the box gets the same ones (`nix/lan-deploy.sh` replays the recorded transactions, skipping any already there). Proving needs nothing from the internet either: the CRS is committed (`circuits/crs`). Add it to a box as `services.ethereumLanNode.games.duel = { package = inputs.duel-in-the-dark.packages.x86_64-linux.lan; webPort = 8002; };`.

## Cost

About 3.7 to 3.9 million gas per proven action (UltraHonk with zero knowledge), so a shot (shoot, answer, free move) is about 11.5 million, and anything that asks the other player something costs two proofs. This belongs on an L2, and a later milestone moves play into a state channel.
