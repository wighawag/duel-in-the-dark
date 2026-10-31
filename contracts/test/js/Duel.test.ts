import {expect} from 'earl';
import {describe, it, before, after} from 'node:test';
import {network} from 'hardhat';
import {parseEther} from 'viem';
import {createZK, type ZK} from 'duel-in-the-dark-circuits';
import {circuits} from 'duel-in-the-dark-circuits/circuits';
import {
	createDuel,
	stateInput,
	ACTION,
	CIRCUIT,
	PHASE,
	type AnswerChoice,
	type Duel,
	type DuelSecret,
	type DuelState,
	type Transition,
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
		return `  ${action.padEnd(28)} ${max.toLocaleString('en-US')} (max of ${all.length})`;
	});
	console.log(`\ngas per action:\n${rows.join('\n')}`);
});

const ANSWER_LABEL: Record<number, string> = {
	[PHASE.SHOT]: 'answer a shot',
	[PHASE.LISTEN]: 'answer a listen',
	[PHASE.DETONATION]: 'answer a detonation',
	[PHASE.CHARGE]: 'answer a charge',
	[PHASE.PURGE]: 'answer a purge',
	[PHASE.CHUTE]: 'answer a chute',
	[PHASE.TRACKER]: 'answer a tracker',
};

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

	function send(seat: number, t: Transition, circuit: number = t.circuit) {
		return env.execute(Duel, {
			functionName: 'act',
			args: [matchId, players[seat], circuit, t.next, t.proof.proof],
			account: players[seat],
		});
	}

	type Played = Transition & {secret?: DuelSecret};

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
		/** `seat` plays what `prove` proves from the current state and its secret */
		async play<T extends Played>(
			seat: number,
			label: string,
			prove: (state: DuelState, secret: DuelSecret) => Promise<T>,
		): Promise<T> {
			const t = await prove(await read(), secrets[seat]);
			record(label, await send(seat, t));
			if (t.secret) secrets[seat] = t.secret;
			return t;
		},
		async move(seat: number, to: number) {
			const before = await read();
			return this.play(
				seat,
				before.phase === PHASE.PLAY ? 'move' : 'move (forced, free)',
				(s, secret) => duel.move(s, secret, to),
			);
		},
		async shoot(seat: number, target: number) {
			return this.play(seat, 'shoot', (s, secret) =>
				duel.shoot(s, secret, target),
			);
		},
		async answer(seat: number, choice?: AnswerChoice) {
			const phase = (await read()).phase;
			return this.play(seat, ANSWER_LABEL[phase] ?? 'answer', (s, secret) =>
				duel.answer(s, secret, choice),
			);
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
		async claimTimeout(by: number) {
			return env.execute(Duel, {
				functionName: 'claimTimeout',
				args: [matchId],
				account: players[by],
			});
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

type M = Awaited<ReturnType<typeof matchWith>>;

/** `state` with seat `seat`'s commitment replaced by `secret`'s. */
function withSecret(
	state: DuelState,
	seat: number,
	secret: DuelSecret,
): DuelState {
	const commitments: DuelState['commitments'] =
		seat === 0
			? [secret.commitment, state.commitments[1]]
			: [state.commitments[0], secret.commitment];
	return {...state, commitments};
}

describe('Duel', function () {
	it('starts on turn 1 with the turn holder on 2 AP, nothing pending, nobody hit', async function () {
		const m = await startedMatch([1, 8]);
		const s = await m.state();
		expect([
			s.ap,
			s.phase,
			s.hits,
			s.argA,
			s.argB,
			s.turn,
			s.acted,
			s.armed,
		]).toEqual([2, PHASE.PLAY, [0, 0], 0, 0, 1, 0, 0]);
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
		expect([s.phase, s.argA, s.argB, s.ap, s.last]).toEqual([
			PHASE.SHOT,
			4,
			7,
			0,
			ACTION.SHOOT,
		]);
		expect((await m.match()).awaiting).toEqual(1 << other);

		const hit = await m.answer(other);
		expect(hit.hit).toEqual(true);
		s = await m.state();
		expect([s.phase, s.actor, s.hits[other], s.last]).toEqual([
			PHASE.MOVE_AFTER_SHOT,
			turn,
			1,
			ACTION.ANSWER,
		]);

		await m.move(turn, 2);
		s = await m.state();
		expect([s.phase, s.actor, s.ap, s.argA, s.turn]).toEqual([
			PHASE.PLAY,
			other,
			2,
			0,
			2,
		]);

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
		const lie = await duel.answer({...real, argB: 6}, m.secrets[m.other]);
		expect(lie.hit).toEqual(false);
		await expect(m.send(m.other, lie)).toBeRejectedWith('InvalidProof');
		// Nor with the claimed result rewritten to look like this shot.
		await expect(
			m.send(m.other, {...lie, next: {...lie.next, argB: 7}}),
		).toBeRejectedWith('InvalidProof');
	});

	it('cannot claim a false hit', async function () {
		const m = await matchWith(4, 7);
		await m.shoot(m.turn, 6);
		const real = await m.state();
		const lie = await duel.answer({...real, argB: 7}, m.secrets[m.other]);
		expect(lie.hit).toEqual(true);
		await expect(
			m.send(m.other, {...lie, next: {...lie.next, argB: 6}}),
		).toBeRejectedWith('InvalidProof');
	});

	it('cannot move from a room its commitment does not hold', async function () {
		const m = await matchWith(1, 8);
		const real = await m.state();
		// A real proof of a move 3 -> 2, from a made-up commitment.
		const madeUp = (await duel.start(3)).secret;
		const forged = await duel.move(withSecret(real, m.turn, madeUp), madeUp, 2);
		await expect(m.send(m.turn, forged)).toBeRejectedWith('InvalidProof');
	});

	it('cannot keep the action point a move cost', async function () {
		const m = await matchWith(1, 8);
		const t = await duel.move(await m.state(), m.secrets[m.turn], 2);
		await expect(
			m.send(m.turn, {...t, next: {...t.next, ap: 2}}),
		).toBeRejectedWith('InvalidProof');
	});

	it('cannot shoot with one action point left', async function () {
		const m = await matchWith(1, 8);
		await m.move(m.turn, 2);
		const s = await m.state();
		expect(s.ap).toEqual(1);
		// A valid shot proof, for the same position with the points it no longer has.
		const t = await duel.shoot({...s, ap: 2}, m.secrets[m.turn], 1);
		await expect(m.send(m.turn, t)).toBeRejectedWith('InvalidProof');
	});

	it('cannot replay a proof', async function () {
		const m = await matchWith(1, 8);
		const t = await m.move(m.turn, 2);
		await expect(m.send(m.turn, t)).toBeRejectedWith('InvalidProof');
	});

	it('checks a proof with the verifier it names, and knows only five', async function () {
		const m = await matchWith(1, 8);
		const t = await duel.move(await m.state(), m.secrets[m.turn], 2);
		await expect(m.send(m.turn, t, CIRCUIT.SHOOT)).toBeRejectedWith(
			'InvalidProof',
		);
		await expect(m.send(m.turn, t, CIRCUIT.ANSWER)).toBeRejectedWith(
			'InvalidProof',
		);
		await expect(m.send(m.turn, t, 5)).toBeRejectedWith('NoSuchCircuit');
	});

	it('refuses actions out of turn, and answers from anyone not awaited', async function () {
		const m = await matchWith(1, 8);
		const t = await duel.move(
			{...(await m.state()), actor: m.other},
			m.secrets[m.other],
			7,
		);
		await expect(m.send(m.other, t)).toBeRejectedWith('NotYourTurn');

		await m.shoot(m.turn, 2);
		const s = await m.state();
		// The shooter cannot answer its own shot, nor act while it is pending.
		const own = await duel.answer({...s, actor: m.other}, m.secrets[m.turn]);
		await expect(m.send(m.turn, own)).toBeRejectedWith('NotAwaited');
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
				functionName: 'act',
				args: [m.matchId, m.players[m.turn], t.circuit, t.next, t.proof.proof],
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

	// --- milestone D --------------------------------------------------------

	it('listens: the other names a room next to its own, and cannot name another', async function () {
		const m = await matchWith(1, 7);
		await m.play(m.turn, 'listen', (s) => duel.listen(s));
		let s = await m.state();
		expect([s.phase, s.ap, s.last]).toEqual([PHASE.LISTEN, 1, ACTION.LISTEN]);
		expect((await m.match()).awaiting).toEqual(1 << m.other);
		// A real proof that a seat in the Bridge would name the Cryo Bay.
		const bridge = (await duel.start(2)).secret;
		const lie = await duel.answer(withSecret(s, m.other, bridge), bridge, {
			reveal: 1,
		});
		await expect(m.send(m.other, lie)).toBeRejectedWith('InvalidProof');
		await m.answer(m.other, {reveal: 8});
		s = await m.state();
		expect([s.phase, s.argA, s.argB, s.last, s.actor]).toEqual([
			PHASE.PLAY,
			0,
			8,
			ACTION.ANSWER,
			m.turn,
		]);
	});

	it('sets traps, replaces one, and detonates it on the other player', async function () {
		const m = await matchWith(6, 1);
		await m.play(m.turn, 'set a trap', (s, secret) => duel.setTrap(s, secret));
		await m.move(m.turn, 7);
		await m.endTurn(m.other); // the turn passed when the AP ran out
		await m.play(m.turn, 'set a trap', (s, secret) => duel.setTrap(s, secret));
		await m.move(m.turn, 5);
		await m.move(m.other, 5);
		await m.endTurn(m.other);
		// a third trap replaces the first, in the Mess Hall
		await m.play(m.turn, 'set a trap (replacing one)', (s, secret) =>
			duel.setTrap(s, secret, 6),
		);
		expect(m.secrets[m.turn].traps).toEqual([5, 7]);
		// the other is in the Galley, where the turn holder stands too
		await m.play(m.turn, 'detonate', (s, secret) =>
			duel.detonate(s, secret, 5),
		);
		const s = await m.state();
		expect([s.phase, s.argB, s.last]).toEqual([
			PHASE.DETONATION,
			5,
			ACTION.DETONATE,
		]);
		// The other cannot answer as if it were elsewhere.
		const elsewhere = (await duel.start(6)).secret;
		const lie = await duel.answer(withSecret(s, m.other, elsewhere), elsewhere);
		await expect(m.send(m.other, lie)).toBeRejectedWith('InvalidProof');
		const answer = await m.answer(m.other);
		expect(answer.hit).toEqual(true);
		expect((await m.state()).hits[m.other]).toEqual(1);
		expect((await m.state()).hits[m.turn]).toEqual(0);
	});

	it("sets a Remote Charge, which must go off at the start of the setter's next turn", async function () {
		const m = await matchWith(8, 6);
		await m.play(m.turn, 'set the Remote Charge', (s, secret) =>
			duel.remoteCharge(s, secret, 6),
		);
		let s = await m.state();
		expect([s.armed, s.argA]).toEqual([1 << m.turn, 8]);
		await m.endTurn(m.turn);
		await m.endTurn(m.other);
		// Due: the turn cannot end, and nothing else can be proven.
		await expect(m.endTurn(m.turn)).toBeRejectedWith('TurnNotOver');
		s = await m.state();
		const ignored = await duel.move({...s, armed: 0}, m.secrets[m.turn], 7);
		await expect(m.send(m.turn, ignored)).toBeRejectedWith('InvalidProof');
		await m.play(m.turn, 'the Remote Charge goes off', (state, secret) =>
			duel.fireCharge(state, secret),
		);
		s = await m.state();
		expect([s.phase, s.argB, s.armed, s.ap]).toEqual([PHASE.CHARGE, 6, 0, 2]);
		const answer = await m.answer(m.other);
		expect(answer.hit).toEqual(true);
		// and the turn goes on, with its 2 points
		s = await m.state();
		expect([s.phase, s.actor, s.ap]).toEqual([PHASE.PLAY, m.turn, 2]);
		await m.endTurn(m.turn);
	});

	it('gives the match to the other player when a due charge is never set off', async function () {
		const m = await matchWith(8, 6);
		await m.play(m.turn, 'set the Remote Charge', (s, secret) =>
			duel.remoteCharge(s, secret, 6),
		);
		await m.endTurn(m.turn);
		await m.endTurn(m.other);
		await networkHelpers.time.increase(TURN + 1);
		await m.claimTimeout(m.other);
		const s = await m.match();
		expect([s.status, s.winner]).toEqual([3, m.other]);
	});

	it('grants a third action point for starting the turn in the Galley, once', async function () {
		const m = await matchWith(5, 1);
		await m.play(m.turn, 'Stim Rations', (s, secret) =>
			duel.stimRations(s, secret),
		);
		let s = await m.state();
		expect([s.ap, s.argA, s.last]).toEqual([3, 5, ACTION.STIM_RATIONS]);
		const again = await duel.stimRations({...s, acted: 0}, m.secrets[m.turn]);
		await expect(m.send(m.turn, again)).toBeRejectedWith('InvalidProof');
		await m.move(m.turn, 6);
		await m.move(m.turn, 7);
		await m.move(m.turn, 4);
		s = await m.state();
		expect([s.actor, s.ap]).toEqual([m.other, 2]);
	});

	it("purges the Engine Room: a hit, a hidden forced move, a seal until the purger's next turn", async function () {
		const m = await matchWith(1, 8);
		await m.play(m.turn, 'Coolant Purge', (s, secret) =>
			duel.coolantPurge(s, secret),
		);
		let s = await m.state();
		expect([s.phase, s.sealedRoom, s.sealedTurn]).toEqual([PHASE.PURGE, 8, 1]);
		// It cannot stay in the Engine Room: a proof that a seat in the Mess
		// Hall was missed is not this answer.
		const mess = (await duel.start(6)).secret;
		const dodge = await duel.answer(withSecret(s, m.other, mess), mess);
		await expect(m.send(m.other, dodge)).toBeRejectedWith('InvalidProof');
		const answer = await m.answer(m.other, {to: 7});
		expect(answer.hit).toEqual(true);
		expect(answer.secret.room).toEqual(7);
		s = await m.state();
		expect(s.commitments[m.other]).toEqual(answer.secret.commitment);
		await m.endTurn(m.turn);
		// The other cannot walk back in during its turn...
		s = await m.state();
		const back = await duel.move({...s, sealedRoom: 0}, m.secrets[m.other], 8);
		await expect(m.send(m.other, back)).toBeRejectedWith('InvalidProof');
		await m.endTurn(m.other);
		await m.endTurn(m.turn);
		// ...but can once the purger's next turn has started.
		await m.move(m.other, 8);
	});

	it('drops whoever is in the Galley into the Engine Room, silently', async function () {
		const m = await matchWith(3, 5);
		const before = await m.state();
		await m.play(m.turn, 'Maintenance Chute', (s, secret) =>
			duel.maintenanceChute(s, secret),
		);
		const answer = await m.answer(m.other);
		expect([answer.hit, answer.secret.room]).toEqual([false, 8]);
		const s = await m.state();
		expect(s.hits).toEqual([0, 0]);
		expect(s.commitments[m.other]).not.toEqual(before.commitments[m.other]);
	});

	it('tracks the upper deck exactly, once per turn, for free', async function () {
		const m = await matchWith(7, 2);
		await m.play(m.turn, 'Motion Tracker', (s, secret) =>
			duel.motionTracker(s, secret),
		);
		await m.answer(m.other);
		let s = await m.state();
		expect([s.argA, s.argB, s.ap, s.tracked]).toEqual([1, 2, 2, 1]);
		const again = await duel.motionTracker(
			{...s, tracked: 0},
			m.secrets[m.turn],
		);
		await expect(m.send(m.turn, again)).toBeRejectedWith('InvalidProof');
		s = await m.state();
		expect(s.phase).toEqual(PHASE.PLAY);
	});

	it('drops down from the Gantry to the Galley for free', async function () {
		const m = await matchWith(4, 1);
		await m.play(m.turn, 'Drop Down', (s, secret) => duel.dropDown(s, secret));
		const s = await m.state();
		expect([s.argA, s.argB, s.ap, s.last]).toEqual([4, 5, 2, ACTION.DROP_DOWN]);
		expect(m.secrets[m.turn].room).toEqual(5);
	});

	// --- timeouts -----------------------------------------------------------

	it('gives the match to the other player when the turn holder does not act', async function () {
		const m = await matchWith(1, 8);
		await networkHelpers.time.increase(TURN + 1);
		record('claimTimeout', await m.claimTimeout(m.other));
		const s = await m.match();
		expect([s.status, s.winner]).toEqual([3, m.other]);
	});

	it('gives the match to the target when the shooter never makes its free move', async function () {
		const m = await matchWith(1, 8);
		await m.shoot(m.turn, 2);
		await m.answer(m.other);
		await networkHelpers.time.increase(TURN + 1);
		await m.claimTimeout(m.other);
		const s = await m.match();
		expect([s.status, s.winner]).toEqual([3, m.other]);
	});

	const queries: [string, number, number, (m: M) => Promise<unknown>][] = [
		['a shot', 1, 8, (m) => m.shoot(m.turn, 2)],
		['a listen', 1, 8, (m) => m.play(m.turn, 'listen', (s) => duel.listen(s))],
		[
			'a detonation',
			1,
			8,
			async (m) => {
				await m.play(m.turn, 'set a trap', (s, secret) =>
					duel.setTrap(s, secret),
				);
				await m.play(m.turn, 'detonate', (s, secret) =>
					duel.detonate(s, secret, 1),
				);
			},
		],
		[
			'a Remote Charge',
			8,
			1,
			async (m) => {
				await m.play(m.turn, 'set the Remote Charge', (s, secret) =>
					duel.remoteCharge(s, secret, 2),
				);
				await m.endTurn(m.turn);
				await m.endTurn(m.other);
				await m.play(m.turn, 'the Remote Charge goes off', (s, secret) =>
					duel.fireCharge(s, secret),
				);
			},
		],
		[
			'a purge',
			1,
			8,
			(m) => m.play(m.turn, 'Coolant Purge', (s, x) => duel.coolantPurge(s, x)),
		],
		[
			'a chute',
			3,
			8,
			(m) =>
				m.play(m.turn, 'Maintenance Chute', (s, x) =>
					duel.maintenanceChute(s, x),
				),
		],
		[
			'a tracker',
			7,
			1,
			(m) =>
				m.play(m.turn, 'Motion Tracker', (s, x) => duel.motionTracker(s, x)),
		],
	];
	for (const [name, turnRoom, otherRoom, ask] of queries) {
		it(`gives the match to the turn holder when ${name} is not answered`, async function () {
			const m = await matchWith(turnRoom, otherRoom);
			await ask(m);
			expect((await m.match()).awaiting).toEqual(1 << m.other);
			await expect(m.claimTimeout(m.turn)).toBeRejectedWith(
				'DeadlineNotPassed',
			);
			await networkHelpers.time.increase(RESPONSE + 1);
			await m.claimTimeout(m.turn);
			const s = await m.match();
			expect([s.status, s.winner]).toEqual([3, m.turn]);
		});
	}

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

	it('every one of the 32 public inputs is bound: changing any one fails verification', async function () {
		const m = await matchWith(4, 7);
		const s = await m.state();
		const t = await duel.shoot(s, m.secrets[m.turn], 7);
		// The proof's public inputs are the state then the next state, in the
		// order of the circuit's State (the contract encodes them the same way,
		// or no action would ever verify).
		const flat = (x: DuelState) =>
			Object.values(stateInput(x))
				.flat()
				.map((v) => BigInt(v as string));
		expect(t.proof.publicInputs.map(BigInt)).toEqual([
			...flat(s),
			...flat(t.next),
		]);
		const inputs = t.proof.publicInputs as `0x${string}`[];
		const verifier = m.DuelShootVerifier;
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
		// and the contract accepts the untampered proof
		await m.send(m.turn, t);
	});
});
