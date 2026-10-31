import {expect} from 'earl';
import {describe, it, before, after} from 'node:test';
import {network} from 'hardhat';
import {parseEther} from 'viem';
import {createZK, type ZK, type Proof} from 'duel-in-the-dark-circuits';
import {circuits} from 'duel-in-the-dark-circuits/circuits';
import {
	createDuel,
	PHASE,
	type Duel,
	type DuelSecret,
	type DuelState,
} from 'duel-in-the-dark-circuits/duel';
import {setupFixtures} from './utils/index.js';

// Whole matches with real proofs, through the deploy scripts the app uses.
// What a test cannot prove (a lie, a jump, a shot out of sight) has no proof
// at all, which the circuit tests cover; here every cheat is a REAL proof of
// some other statement, which the contract must refuse because it builds the
// statement's `state` half itself.

const {provider, networkHelpers} = await network.connect();
const {deployAll} = setupFixtures(provider);

const STAKE = parseEther('1');
const TURN = 10 * 60;
const RESPONSE = 5 * 60;

let zk: ZK;
let duel: Duel;

/** gas per action, printed at the end and recorded in a finding */
const gas = new Map<string, bigint[]>();
function record(action: string, receipt: unknown) {
	const used = BigInt((receipt as {gasUsed: string | bigint}).gasUsed);
	gas.set(action, [...(gas.get(action) ?? []), used]);
}

before(async () => {
	zk = await createZK();
	duel = createDuel(zk, circuits);
});
after(async () => {
	await zk.destroy();
	const rows = [...gas].map(([action, all]) => {
		const max = all.reduce((a, b) => (a > b ? a : b));
		return `  ${action.padEnd(24)} ${max.toLocaleString('en-US')} (max of ${all.length})`;
	});
	console.log(`\ngas per action:\n${rows.join('\n')}`);
});

/**
 * A started match: seat 0 starts in rooms[0], seat 1 in rooms[1]. Who plays
 * first is a coin flip, so the helpers speak of `turn` and `other`.
 */
async function startedMatch(rooms: [number, number]) {
	const fixture = await networkHelpers.loadFixture(deployAll);
	const {env, Duel, unnamedAccounts} = fixture;
	const players = [unnamedAccounts[0], unnamedAccounts[1]] as const;
	const secrets: DuelSecret[] = [];

	const first = await duel.start(rooms[0]);
	secrets.push(first.secret);
	record(
		'createMatch',
		await env.execute(Duel, {
			functionName: 'createMatch',
			args: [players[0], first.secret.commitment, first.proof.proof],
			account: players[0],
			value: STAKE,
		}),
	);
	const matchId = await env.read(Duel, {functionName: 'lastMatchId'});

	const second = await duel.start(rooms[1]);
	secrets.push(second.secret);
	record(
		'joinMatch',
		await env.execute(Duel, {
			functionName: 'joinMatch',
			args: [matchId, players[1], second.secret.commitment, second.proof.proof],
			account: players[1],
			value: STAKE,
		}),
	);

	const read = async (): Promise<DuelState> => {
		const s = await env.read(Duel, {functionName: 'getState', args: [matchId]});
		return {
			...s,
			commitments: [s.commitments[0], s.commitments[1]],
			hits: [s.hits[0], s.hits[1]],
		};
	};
	const turn = (await read()).actor;
	const other = turn === 0 ? 1 : 0;

	function send(
		functionName: 'move' | 'shoot' | 'answerShot',
		seat: number,
		t: {next: DuelState; proof: Proof},
	) {
		return env.execute(Duel, {
			functionName,
			args: [matchId, players[seat], t.next, t.proof.proof],
			account: players[seat],
		});
	}

	return {
		...fixture,
		matchId,
		players,
		secrets,
		turn,
		other,
		state: read,
		async match() {
			return (await env.read(Duel, {functionName: 'getMatch', args: [matchId]}))
				.state;
		},
		send,
		/** `seat` moves to `to` (as it must: it is the actor), and keeps its new secret */
		async move(seat: number, to: number) {
			const before = await read();
			const t = await duel.move(before, secrets[seat], to);
			const receipt = await send('move', seat, t);
			record(
				before.phase === PHASE.PLAY ? 'move' : 'move (forced, free)',
				receipt,
			);
			secrets[seat] = t.secret;
			return t;
		},
		async shoot(seat: number, target: number) {
			const t = await duel.shoot(await read(), secrets[seat], target);
			record('shoot', await send('shoot', seat, t));
			return t;
		},
		async answer(seat: number) {
			const t = await duel.answerShot(await read(), secrets[seat]);
			record('answerShot', await send('answerShot', seat, t));
			return t;
		},
		async endTurn(seat: number) {
			record(
				'endTurn',
				await env.execute(Duel, {
					functionName: 'endTurn',
					args: [matchId, players[seat]],
					account: players[seat],
				}),
			);
		},
	};
}

/** Starting rooms with the turn holder in `turnRoom` and the other in `otherRoom`. */
async function matchWith(turnRoom: number, otherRoom: number) {
	// The coin flip decides who goes first; try both seatings until it agrees.
	let m = await startedMatch([turnRoom, otherRoom]);
	if (m.turn !== 0) m = await swapped(turnRoom, otherRoom);
	return m;
}
async function swapped(turnRoom: number, otherRoom: number) {
	const m = await startedMatch([otherRoom, turnRoom]);
	if (m.turn !== 1)
		throw new Error('the coin flip is not deterministic for a fixture');
	return m;
}

describe('Duel', function () {
	it('starts with the turn holder on 2 AP, nothing pending, nobody hit', async function () {
		const m = await startedMatch([1, 8]);
		const s = await m.state();
		expect([s.ap, s.phase, s.hits, s.argA, s.argB]).toEqual([
			2,
			PHASE.PLAY,
			[0, 0],
			0,
			0,
		]);
		expect(s.commitments).toEqual([
			m.secrets[0].commitment,
			m.secrets[1].commitment,
		]);
		expect((await m.match()).status).toEqual(2); // Active
	});

	it('plays a whole match to two hits, and pays the winner', async function () {
		const m = await matchWith(4, 7);
		const {turn, other} = m;

		// The Gantry sees the Cargo Hold: a hit. The turn waits for the answer,
		// then for the shooter's free move, and only then passes.
		await m.shoot(turn, 7);
		let s = await m.state();
		expect([s.phase, s.argA, s.argB, s.ap]).toEqual([PHASE.SHOT, 4, 7, 0]);
		expect((await m.match()).awaiting).toEqual(1 << other);

		const hit = await m.answer(other);
		expect(hit.hit).toEqual(true);
		s = await m.state();
		expect([s.phase, s.actor, s.hits[other]]).toEqual([
			PHASE.MOVE_AFTER_SHOT,
			turn,
			1,
		]);

		await m.move(turn, 2);
		s = await m.state();
		expect([s.phase, s.actor, s.ap, s.argA]).toEqual([PHASE.PLAY, other, 2, 0]);

		// The other shoots blind into the Galley (the shooter is on the Bridge).
		await m.shoot(other, 5);
		const miss = await m.answer(turn);
		expect(miss.hit).toEqual(false);
		await m.move(other, 8);
		expect((await m.state()).actor).toEqual(turn);

		// Back to the Gantry (1 AP), then the turn ends by choice.
		await m.move(turn, 4);
		await m.endTurn(turn);
		// The other walks into sight, and ends its turn.
		await m.move(other, 7);
		await m.endTurn(other);

		// Second hit: over, without a forced move.
		await m.shoot(turn, 7);
		await m.answer(other);
		s = await m.state();
		expect([s.phase, s.hits[other]]).toEqual([PHASE.OVER, 2]);
		const finished = await m.match();
		expect([finished.status, finished.winner]).toEqual([3, turn]); // Finished

		const winner = m.players[turn];
		expect(
			await m.env.read(m.Duel, {functionName: 'balanceOf', args: [winner]}),
		).toEqual(STAKE * 2n);
		await expect(
			m.env.execute(m.Duel, {
				functionName: 'withdraw',
				account: m.players[other],
			}),
		).toBeRejectedWith('NothingToWithdraw');
		record(
			'withdraw',
			await m.env.execute(m.Duel, {functionName: 'withdraw', account: winner}),
		);
		expect(
			await m.env.read(m.Duel, {functionName: 'balanceOf', args: [winner]}),
		).toEqual(0n);
	});

	it('cannot deny a hit: a proven miss of another shot is refused', async function () {
		const m = await matchWith(4, 7);
		await m.shoot(m.turn, 7);
		const real = await m.state();
		// A true proof: "no hit" for a shot into the Mess Hall, which was not this shot.
		const lie = await duel.answerShot({...real, argB: 6}, m.secrets[m.other]);
		expect(lie.hit).toEqual(false);
		await expect(m.send('answerShot', m.other, lie)).toBeRejectedWith(
			'InvalidProof',
		);
		// Nor with the claimed result rewritten to look like this shot.
		await expect(
			m.send('answerShot', m.other, {...lie, next: {...lie.next, argB: 7}}),
		).toBeRejectedWith('InvalidProof');
	});

	it('cannot claim a false hit', async function () {
		const m = await matchWith(4, 7);
		await m.shoot(m.turn, 6);
		const real = await m.state();
		const lie = await duel.answerShot({...real, argB: 7}, m.secrets[m.other]);
		expect(lie.hit).toEqual(true);
		await expect(
			m.send('answerShot', m.other, {...lie, next: {...lie.next, argB: 6}}),
		).toBeRejectedWith('InvalidProof');
	});

	it('cannot move from a room its commitment does not hold', async function () {
		const m = await matchWith(1, 8);
		const real = await m.state();
		// A real proof of a move 3 -> 2, from a made-up commitment.
		const madeUp = (await duel.start(3)).secret;
		const commitments: DuelState['commitments'] =
			m.turn === 0
				? [madeUp.commitment, real.commitments[1]]
				: [real.commitments[0], madeUp.commitment];
		const forged = await duel.move({...real, commitments}, madeUp, 2);
		await expect(m.send('move', m.turn, forged)).toBeRejectedWith(
			'InvalidProof',
		);
	});

	it('cannot keep the action point a move cost', async function () {
		const m = await matchWith(1, 8);
		const t = await duel.move(await m.state(), m.secrets[m.turn], 2);
		await expect(
			m.send('move', m.turn, {...t, next: {...t.next, ap: 2}}),
		).toBeRejectedWith('InvalidProof');
	});

	it('cannot shoot with one action point left', async function () {
		const m = await matchWith(1, 8);
		await m.move(m.turn, 2);
		const s = await m.state();
		expect(s.ap).toEqual(1);
		// A valid shot proof, for the same position with the points it no longer has.
		const t = await duel.shoot({...s, ap: 2}, m.secrets[m.turn], 1);
		await expect(m.send('shoot', m.turn, t)).toBeRejectedWith('InvalidProof');
	});

	it('cannot replay a proof', async function () {
		const m = await matchWith(1, 8);
		const t = await m.move(m.turn, 2);
		await expect(m.send('move', m.turn, t)).toBeRejectedWith('InvalidProof');
	});

	it('refuses actions out of turn, and answers from anyone not awaited', async function () {
		const m = await matchWith(1, 8);
		const t = await duel.move(
			{...(await m.state()), actor: m.other},
			m.secrets[m.other],
			7,
		);
		await expect(m.send('move', m.other, t)).toBeRejectedWith('NotYourTurn');

		await m.shoot(m.turn, 2);
		const s = await m.state();
		// The shooter cannot answer its own shot, nor act while it is pending.
		const own = await duel.answerShot(
			{...s, actor: m.other},
			m.secrets[m.turn],
		);
		await expect(m.send('answerShot', m.turn, own)).toBeRejectedWith(
			'NotAwaited',
		);
		await expect(
			m.env.execute(m.Duel, {
				functionName: 'endTurn',
				args: [m.matchId, m.players[m.turn]],
				account: m.players[m.turn],
			}),
		).toBeRejectedWith('QueryPending');
	});

	it('refuses a sender acting for a player it is not a delegate of', async function () {
		const m = await matchWith(1, 8);
		const t = await duel.move(await m.state(), m.secrets[m.turn], 2);
		await expect(
			m.env.execute(m.Duel, {
				functionName: 'move',
				args: [m.matchId, m.players[m.turn], t.next, t.proof.proof],
				account: m.unnamedAccounts[2],
			}),
		).toBeRejected();
	});

	it('holds the turn until the shooter has made its free move', async function () {
		const m = await matchWith(1, 8);
		await m.shoot(m.turn, 2);
		await m.answer(m.other);
		const s = await m.state();
		expect([s.actor, s.ap, s.phase]).toEqual([
			m.turn,
			0,
			PHASE.MOVE_AFTER_SHOT,
		]);
		await expect(
			m.env.execute(m.Duel, {
				functionName: 'endTurn',
				args: [m.matchId, m.players[m.turn]],
				account: m.players[m.turn],
			}),
		).toBeRejectedWith('TurnNotOver');
		await m.move(m.turn, 5);
		expect((await m.state()).actor).toEqual(m.other);
	});

	it('gives the match to the other player when the turn holder does not act', async function () {
		const m = await matchWith(1, 8);
		await networkHelpers.time.increase(TURN + 1);
		record(
			'claimTimeout',
			await m.env.execute(m.Duel, {
				functionName: 'claimTimeout',
				args: [m.matchId],
				account: m.players[m.other],
			}),
		);
		const s = await m.match();
		expect([s.status, s.winner]).toEqual([3, m.other]);
	});

	it('gives the match to the shooter when the target does not answer', async function () {
		const m = await matchWith(1, 8);
		await m.shoot(m.turn, 2);
		await expect(
			m.env.execute(m.Duel, {
				functionName: 'claimTimeout',
				args: [m.matchId],
				account: m.players[m.turn],
			}),
		).toBeRejectedWith('DeadlineNotPassed');
		await networkHelpers.time.increase(RESPONSE + 1);
		await m.env.execute(m.Duel, {
			functionName: 'claimTimeout',
			args: [m.matchId],
			account: m.players[m.turn],
		});
		const s = await m.match();
		expect([s.status, s.winner]).toEqual([3, m.turn]);
	});

	it('gives the match to the target when the shooter never makes its free move', async function () {
		const m = await matchWith(1, 8);
		await m.shoot(m.turn, 2);
		await m.answer(m.other);
		await networkHelpers.time.increase(TURN + 1);
		await m.env.execute(m.Duel, {
			functionName: 'claimTimeout',
			args: [m.matchId],
			account: m.players[m.other],
		});
		const s = await m.match();
		expect([s.status, s.winner]).toEqual([3, m.other]);
	});

	it('refuses an invalid starting commitment, and lets the creator cancel', async function () {
		const {env, Duel, unnamedAccounts} =
			await networkHelpers.loadFixture(deployAll);
		const [creator, joiner] = unnamedAccounts;
		const a = await duel.start(3);
		const b = await duel.start(4);
		await expect(
			env.execute(Duel, {
				functionName: 'createMatch',
				args: [creator, a.secret.commitment, b.proof.proof],
				account: creator,
				value: STAKE,
			}),
		).toBeRejectedWith('InvalidProof');
		await env.execute(Duel, {
			functionName: 'createMatch',
			args: [creator, a.secret.commitment, a.proof.proof],
			account: creator,
			value: STAKE,
		});
		const matchId = await env.read(Duel, {functionName: 'lastMatchId'});
		await expect(
			env.execute(Duel, {
				functionName: 'joinMatch',
				args: [matchId, joiner, b.secret.commitment, b.proof.proof],
				account: joiner,
				value: STAKE / 2n,
			}),
		).toBeRejectedWith('WrongStake');
		await env.execute(Duel, {
			functionName: 'cancelMatch',
			args: [matchId, creator],
			account: creator,
		});
		expect(
			await env.read(Duel, {functionName: 'balanceOf', args: [creator]}),
		).toEqual(STAKE);
	});

	it('every one of the 20 public inputs is bound: changing any one fails verification', async function () {
		const m = await matchWith(4, 7);
		const s = await m.state();
		const t = await duel.shoot(s, m.secrets[m.turn], 7);
		const inputs = await m.env.read(m.Duel, {
			functionName: 'stateInputs',
			args: [s, t.next],
		});
		expect(inputs.map(BigInt)).toEqual(t.proof.publicInputs.map(BigInt));
		const verifier =
			m.env.get<typeof m.DuelShootVerifier.abi>('DuelShootVerifier');
		const verifies = (publicInputs: readonly `0x${string}`[]) =>
			m.env
				.read(verifier, {
					functionName: 'verify',
					args: [t.proof.proof, publicInputs],
				})
				.catch(() => false);
		expect(await verifies(inputs)).toEqual(true);
		for (let i = 0; i < inputs.length; i++) {
			const tampered = [...inputs];
			tampered[i] =
				`0x${(BigInt(inputs[i]) + 1n).toString(16).padStart(64, '0')}`;
			expect([i, await verifies(tampered)]).toEqual([i, false]);
		}
	});
});
