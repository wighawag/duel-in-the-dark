import {expect} from 'earl';
import {describe, it, before, after} from 'node:test';
import {network} from 'hardhat';
import {parseEther} from 'viem';
import {createZK, type ZK} from 'template-zk-game-circuits';
import {circuits} from 'template-zk-game-circuits/circuits';
import {
	createHideAndSeek,
	type HideAndSeek,
	type HideAndSeekSecret,
} from 'template-zk-game-circuits/hide-and-seek';
import {setupFixtures} from './utils/index.js';

// Whole matches with real proofs, through the deploy scripts the app uses.
// The framework (ZKMatches) is tested through the reference game: what it
// promises is only observable through a game's actions.

const {provider, networkHelpers} = await network.connect();
const {deployAll} = setupFixtures(provider);

const STAKE = parseEther('1');

let zk: ZK;
let game: HideAndSeek;

before(async () => {
	zk = await createZK();
	game = createHideAndSeek(zk, circuits);
});
after(async () => {
	await zk.destroy();
});

/** A started match between two unnamed accounts, each hidden in its cell. */
async function startedMatch(cells: [number, number] = [2, 6]) {
	const fixture = await networkHelpers.loadFixture(deployAll);
	const {env, HideAndSeek, unnamedAccounts} = fixture;
	const players = [unnamedAccounts[0], unnamedAccounts[1]] as const;
	const secrets: HideAndSeekSecret[] = [];

	const first = await game.hide(cells[0]);
	secrets.push(first.secret);
	await env.execute(HideAndSeek, {
		functionName: 'createMatch',
		args: [players[0], first.secret.commitment, first.proof.proof],
		account: players[0],
		value: STAKE,
	});
	const matchId = await env.read(HideAndSeek, {functionName: 'lastMatchId'});

	const second = await game.hide(cells[1]);
	secrets.push(second.secret);
	await env.execute(HideAndSeek, {
		functionName: 'joinMatch',
		args: [matchId, players[1], second.secret.commitment, second.proof.proof],
		account: players[1],
		value: STAKE,
	});

	const view = await env.read(HideAndSeek, {
		functionName: 'getMatch',
		args: [matchId],
	});
	const turn = view.state.turnSeat;
	return {
		...fixture,
		matchId,
		players,
		secrets,
		/** seat whose turn it is, and the other one */
		turn,
		other: turn === 0 ? 1 : 0,
		async state() {
			return (
				await env.read(HideAndSeek, {functionName: 'getMatch', args: [matchId]})
			).state;
		},
	};
}

describe('HideAndSeek', function () {
	it('starts a match once the second player joins, with the turn holder on 2 AP', async function () {
		const {state} = await startedMatch();
		const s = await state();
		expect(s.status).toEqual(2); // Active
		expect(s.actionPoints).toEqual(2);
		expect(s.awaiting).toEqual(0);
	});

	it('plays a whole match: a miss, a hidden move, then a hit takes the pot', async function () {
		const m = await startedMatch([2, 6]);
		const {env, HideAndSeek, matchId, players, secrets, turn, other} = m;
		const turnCell = secrets[turn].cell;
		const otherCell = secrets[other].cell;

		// The turn holder guesses wrong: the turn waits for the answer.
		await env.execute(HideAndSeek, {
			functionName: 'guess',
			args: [matchId, players[turn], (otherCell + 1) % 8],
			account: players[turn],
		});
		expect((await m.state()).awaiting).toEqual(1 << other);

		const miss = await game.answer(secrets[other], (otherCell + 1) % 8);
		expect(miss.hit).toEqual(false);
		await env.execute(HideAndSeek, {
			functionName: 'answerGuess',
			args: [matchId, players[other], miss.hit, miss.proof.proof],
			account: players[other],
		});
		let s = await m.state();
		expect([s.awaiting, s.actionPoints, s.turnSeat]).toEqual([0, 1, turn]);

		// Then moves with its last action point, which passes the turn.
		const moved = await game.move(secrets[turn], 1);
		await env.execute(HideAndSeek, {
			functionName: 'move',
			args: [
				matchId,
				players[turn],
				moved.secret.commitment,
				moved.proof.proof,
			],
			account: players[turn],
		});
		secrets[turn] = moved.secret;
		s = await m.state();
		expect([s.turnSeat, s.actionPoints]).toEqual([other, 2]);

		// The other player guesses right.
		await env.execute(HideAndSeek, {
			functionName: 'guess',
			args: [matchId, players[other], (turnCell + 1) % 8],
			account: players[other],
		});
		const hit = await game.answer(secrets[turn], (turnCell + 1) % 8);
		expect(hit.hit).toEqual(true);
		await env.execute(HideAndSeek, {
			functionName: 'answerGuess',
			args: [matchId, players[turn], hit.hit, hit.proof.proof],
			account: players[turn],
		});

		s = await m.state();
		expect([s.status, s.winner]).toEqual([3, other]); // Finished
		expect(
			await env.read(HideAndSeek, {
				functionName: 'balanceOf',
				args: [players[other]],
			}),
		).toEqual(STAKE * 2n);

		await env.execute(HideAndSeek, {
			functionName: 'withdraw',
			account: players[other],
		});
		expect(
			await env.read(HideAndSeek, {
				functionName: 'balanceOf',
				args: [players[other]],
			}),
		).toEqual(0n);
	});

	it('cannot deny a hit: an untrue answer has no valid proof', async function () {
		const {env, HideAndSeek, matchId, players, secrets, turn, other} =
			await startedMatch();
		const otherCell = secrets[other].cell;
		await env.execute(HideAndSeek, {
			functionName: 'guess',
			args: [matchId, players[turn], otherCell],
			account: players[turn],
		});
		// A proof for a miss on ANOTHER cell, submitted as the answer to this guess.
		const lie = await game.answer(secrets[other], (otherCell + 1) % 8);
		await expect(
			env.execute(HideAndSeek, {
				functionName: 'answerGuess',
				args: [matchId, players[other], false, lie.proof.proof],
				account: players[other],
			}),
		).toBeRejectedWith('InvalidProof');
	});

	it('cannot move to a cell the commitment does not support', async function () {
		const {env, HideAndSeek, matchId, players, secrets, turn} =
			await startedMatch();
		// A valid move proof, but from a made-up starting cell.
		const forged = await game.move(
			{...secrets[turn], ...(await game.hide(0)).secret},
			1,
		);
		await expect(
			env.execute(HideAndSeek, {
				functionName: 'move',
				args: [
					matchId,
					players[turn],
					forged.secret.commitment,
					forged.proof.proof,
				],
				account: players[turn],
			}),
		).toBeRejectedWith('InvalidProof');
	});

	it('refuses actions out of turn, and while a query is open', async function () {
		const {env, HideAndSeek, matchId, players, secrets, turn, other} =
			await startedMatch();
		await expect(
			env.execute(HideAndSeek, {
				functionName: 'guess',
				args: [matchId, players[other], 0],
				account: players[other],
			}),
		).toBeRejectedWith('NotYourTurn');

		await env.execute(HideAndSeek, {
			functionName: 'guess',
			args: [matchId, players[turn], (secrets[other].cell + 1) % 8],
			account: players[turn],
		});
		await expect(
			env.execute(HideAndSeek, {
				functionName: 'guess',
				args: [matchId, players[turn], 0],
				account: players[turn],
			}),
		).toBeRejectedWith('QueryPending');
	});

	it('refuses a sender acting for a player it is not a delegate of', async function () {
		const {env, HideAndSeek, matchId, players, turn, unnamedAccounts} =
			await startedMatch();
		await expect(
			env.execute(HideAndSeek, {
				functionName: 'guess',
				args: [matchId, players[turn], 0],
				account: unnamedAccounts[2],
			}),
		).toBeRejected();
	});

	it('gives the match to the turn holder when the queried player does not answer', async function () {
		const m = await startedMatch();
		const {env, HideAndSeek, matchId, players, secrets, turn, other} = m;
		await env.execute(HideAndSeek, {
			functionName: 'guess',
			args: [matchId, players[turn], (secrets[other].cell + 1) % 8],
			account: players[turn],
		});
		await expect(
			env.execute(HideAndSeek, {
				functionName: 'claimTimeout',
				args: [matchId],
				account: players[turn],
			}),
		).toBeRejectedWith('DeadlineNotPassed');

		await networkHelpers.time.increase(5 * 60 + 1);
		await env.execute(HideAndSeek, {
			functionName: 'claimTimeout',
			args: [matchId],
			account: players[turn],
		});
		const s = await m.state();
		expect([s.status, s.winner]).toEqual([3, turn]);
	});

	it('gives the match to the other player when the turn holder does not act', async function () {
		const m = await startedMatch();
		await networkHelpers.time.increase(10 * 60 + 1);
		await m.env.execute(m.HideAndSeek, {
			functionName: 'claimTimeout',
			args: [m.matchId],
			account: m.players[m.other],
		});
		const s = await m.state();
		expect([s.status, s.winner]).toEqual([3, m.other]);
	});

	it('refuses a join with the wrong stake, and an invalid starting commitment', async function () {
		const {env, HideAndSeek, unnamedAccounts} =
			await networkHelpers.loadFixture(deployAll);
		const creator = unnamedAccounts[0];
		const joiner = unnamedAccounts[1];
		const hidden = await game.hide(3);
		await env.execute(HideAndSeek, {
			functionName: 'createMatch',
			args: [creator, hidden.secret.commitment, hidden.proof.proof],
			account: creator,
			value: STAKE,
		});
		const matchId = await env.read(HideAndSeek, {functionName: 'lastMatchId'});

		const other = await game.hide(4);
		await expect(
			env.execute(HideAndSeek, {
				functionName: 'joinMatch',
				args: [matchId, joiner, other.secret.commitment, other.proof.proof],
				account: joiner,
				value: STAKE / 2n,
			}),
		).toBeRejectedWith('WrongStake');
		// A proof that belongs to a different commitment.
		await expect(
			env.execute(HideAndSeek, {
				functionName: 'joinMatch',
				args: [matchId, joiner, other.secret.commitment, hidden.proof.proof],
				account: joiner,
				value: STAKE,
			}),
		).toBeRejectedWith('InvalidProof');
	});

	it('lets the creator cancel an unjoined match and take the stake back', async function () {
		const {env, HideAndSeek, unnamedAccounts} =
			await networkHelpers.loadFixture(deployAll);
		const creator = unnamedAccounts[0];
		const hidden = await game.hide(3);
		await env.execute(HideAndSeek, {
			functionName: 'createMatch',
			args: [creator, hidden.secret.commitment, hidden.proof.proof],
			account: creator,
			value: STAKE,
		});
		const matchId = await env.read(HideAndSeek, {functionName: 'lastMatchId'});
		await env.execute(HideAndSeek, {
			functionName: 'cancelMatch',
			args: [matchId, creator],
			account: creator,
		});
		expect(
			await env.read(HideAndSeek, {functionName: 'balanceOf', args: [creator]}),
		).toEqual(STAKE);
	});
});
