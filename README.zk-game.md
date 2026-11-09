# template-zk-game

A template for onchain games with **hidden information proven in zero knowledge**: a player keeps part of their state secret (where they are, what they hold), publishes only a commitment to it, and proves facts about it with [Noir](https://noir-lang.org) circuits that a Solidity verifier checks on chain. Nobody, the contract included, ever learns more than what each proof states.

It extends [jolly-roger](https://github.com/wighawag/jolly-roger) (its `integration` branch: local signer + embedded chain), so everything described in [README.md](./README.md) still applies. This file covers what the template adds.

## What is here

| Path | What it is |
| --- | --- |
| `flake.nix` | A devshell pinning `nargo`, the Noir compiler. Only needed to change a circuit. |
| `circuits/` | The Noir workspace (one member per circuit) and the TypeScript prover. |
| `circuits/scripts/generate.ts` | Turns compiled circuits into prover artifacts and Solidity verifiers. |
| `circuits/generated/` | Committed circuit artifacts, imported by the web and the tests. |
| `circuits/crs/` | The committed proving setup: just the points the circuits need (see Known constraints). |
| `contracts/src/verifiers/` | Committed, generated verifiers: one per circuit plus a shared base. |
| `contracts/deploy/000_deploy_verifiers.ts` | Deploys the shared libraries once and one verifier per circuit. |
| `contracts/src/zk-game/ZKMatches.sol` | The match framework every game inherits (see below). |
| `contracts/src/HideAndSeek/` | The reference game: the smallest game that uses all of the framework. |
| `circuits/commitment/` | The one commitment scheme, a Noir library every circuit uses. |
| `circuits/src/hide-and-seek.ts` | The game's client side: secrets and proofs, shared by the web and the tests. |
| `web/src/lib/zk/` | The app's lazily loaded prover. |
| `web/src/routes/hide-and-seek/` | Play the reference game: lobby, match, backup of hidden state. |
| `web/src/routes/zk/` | A demo: commit to a value, prove it is in range, verify on chain. |

## The pipeline

```
circuits/<name>/src/main.nr
   │  nargo compile --workspace            (devshell)
   ▼
circuits/target/<name>.json
   │  pnpm --filter ./circuits crs          (first; downloads only when a circuit outgrew the points)
   │  pnpm --filter ./circuits generate     (no nargo needed)
   ├─► circuits/crs/index.ts                 the CRS points every circuit needs
   ├─► circuits/generated/<name>.json        prover artifact, imported by web + tests
   ├─► contracts/src/verifiers/<Name>Verifier.sol
   └─► contracts/src/verifiers/HonkVerifierBase.sol
```

Generated files are committed, so a clone compiles the contracts, runs the tests and builds the web **without nargo installed**. Only changing a circuit needs the devshell:

```bash
nix develop            # provides nargo, pinned
pnpm circuits:build    # nargo compile + generate + tsc
pnpm circuits:test     # nargo test + the prover tests
```

## The match framework

`ZKMatches` owns what does not depend on a game's rules: many concurrent 2-seat matches with an escrowed ETH stake; a commitment per seat standing for that player's hidden state, replaced only through a proven transition; alternating turns paid in action points; **queries**, actions the other seat must answer with a proof before the turn goes on; a deadline on every wait, after which anyone can end the match against whoever was being waited for; pull payouts; and delegation, so the browser's signer plays without wallet prompts while only the player can withdraw.

A game inherits it and writes its actions. A game whose turn can owe an action that is neither paid in action points nor a query (a forced move after a shot) overrides `_turnMayEnd`, and the turn waits for it. A turn starts with no proof, so nothing of the game runs at that moment; instead every match counts its turns (`turn`, from 1), and a game states anything tied to turn boundaries (an effect lasting until a player's next turn, something owed at the start of a turn, once per turn) as a function of that number and its own public state. A game may also limit how many turns a match lasts (`_turnLimit`, none by default): when the last turn ends, `_outcomeAtTurnLimit` names the winner from public state, or a draw (`NO_WINNER`), which gives each seat its own stake back; everything that holds a turn open (a query, `_turnMayEnd`, a deadline) holds the last one too. An answer may carry a hidden transition of the responder's own (a forced move): it replaces the responder's commitment like any other proven action. The one rule that matters: **a proof's public inputs are built from storage and the pending query, never taken from the caller**; only the claimed result (a hit, a new commitment) comes from the player, and the proof binds it. `HideAndSeek` is the worked example, and ADR-0003 on the `work` branch has the reasoning and what is deliberately left out.

A game REPLACING HideAndSeek names itself in four places and edits no other inherited file: its `$app-specific` module (the alias in `web/svelte.config.js`, exporting `GAME` for the navbar and home page), `GAME` in `web/e2e/routes.ts` for the inherited e2e suites, `web/test/lib/game-world.ts` for the unit suites that boot an embedded chain, and its own deploy script, contract, circuits and route.

On the web, a player's secrets (value and salt behind each commitment) live only in the browser, stored under the commitment they open BEFORE the transaction is sent, so the current one is always the one the chain holds. Losing them loses the match, which is why the page offers a backup.

## Design decisions

- **One proving backend.** Proofs, verification keys and the Solidity verifiers all come from `@aztec/bb.js`, in node and in the browser alike. The native `bb` CLI is not used: a CLI and a browser prover on two versions is precisely the mismatch that fails with an unreadable error at proving time.
- **Pinned together.** `nargo` (in `flake.nix`), `@noir-lang/noir_js` and `@aztec/bb.js` (exact versions in `circuits/package.json`) must agree on the artifact format. Bump them together, then run `pnpm circuits:build` and the whole test suite. Currently: Noir `1.0.0`, bb.js `5.3.0`.
- **Commitments are Poseidon2**, from [noir-lang/poseidon](https://github.com/noir-lang/poseidon) in circuits and `poseidon2Hash` from bb.js in TypeScript (`zk.commit`). A test on each side pins the same number, so the two cannot drift silently.
- **A shared verifier base.** bb.js emits one verifier per circuit, but everything except the verification key is identical across circuits, and its two big libraries are linked rather than inlined. `generate` therefore splits it: `HonkVerifierBase.sol` is deployed once, each `<Name>Verifier.sol` holds only its key. Generation fails if two circuits ever disagree on the shared part.

## Known constraints

- **Verifier size.** A verifier is about 24.1 KB unoptimized (the default profile, used by tests) and 19.5 KB with the production profile, against the 24 KB (24,576 bytes) limit. It is mostly fixed code, so more circuits do not grow it much, but it is close to the limit.
- **The proving setup (CRS) is committed, so proving never touches the network.** Left alone, bb.js 5.3 downloads 2^19 G1 points (16 MB) and 4 MB of Grumpkin points from Aztec's CDN when a prover starts, whatever the circuit, and in node its native binary downloads into `~/.bb-crs`. UltraHonk needs only as many G1 points as the largest circuit's dyadic size, plus the G2 point, so `circuits/crs/index.ts` holds exactly those (4096 points, 256 KB, for this template's circuits) and `createZK` hands them to bb.js's WASM build, in node too. `pnpm --filter ./circuits crs` regenerates it, and `pnpm circuits:build` runs it before `generate`; it downloads only when a circuit outgrows the committed points, so that is the one step that needs the internet. A game served from a LAN box with no uplink therefore proves exactly as one served from the internet (`nix build .#lan` packages it for one: "On a LAN box, with no internet" in README.md; the `"lan"` field of `package.json` builds the prover's JS first, as its `preBuild`).
- **Single-threaded proving on static hosting.** Multi-threaded proving needs cross-origin isolation (COOP/COEP headers), which static and IPFS hosting cannot set. bb.js then proves single-threaded, which is slower but works: the browser test proves exactly that way.

- **Every proven action costs about 3.5 to 4 million gas** (the UltraHonk ZK verifier; a plain action is ~65k). Zero knowledge cannot be dropped, since it is what hides the state, so these games belong on an L2 or a cheap chain, and the signer's credits must be sized per proof.
- **The prover is heavy to download.** Noir's wasm is ~3.9 MB and bb.js ships Barretenberg in two ~4 MB chunks; the inherited service worker precaches them, so a first visit downloads about 20 MB in the background. Good for playing offline, costly on a phone; decide per game.

## Inspiration

The first game built on this template is [duel-in-the-dark](https://github.com/wighawag/duel-in-the-dark), a digital take on the card game *Revolver Noir* (Xavier Davidson, Button Shy). That is where the 2-player match framework this template will grow (matches, turns, queries answered with proofs) is being shaped.
