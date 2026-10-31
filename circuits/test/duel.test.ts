import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {Noir} from '@noir-lang/noir_js';
import {createZK, type ZK, type Hex} from '../src/index.js';
import {
	createDuel,
	canMove,
	canShoot,
	hiddenIn,
	hiddenInput,
	nextAfterAnswer,
	nextAfterShoot,
	pack,
	stateInput,
	ACTION,
	CIRCUIT,
	PHASE,
	MOVES,
	ROOMS,
	type Duel,
	type DuelSecret,
	type DuelState,
	type Transition,
} from '../src/duel.js';
import {circuits} from '../generated/index.js';

function fresh(commitments: [Hex, Hex], actor = 0): DuelState {
	return {
		commitments,
		hits: [0, 0],
		actor,
		ap: 2,
		phase: PHASE.PLAY,
		argA: 0,
		argB: 0,
		sealedRoom: 0,
		turn: 1,
		acted: 0,
		sealedTurn: 0,
		tracked: 0,
		armed: 0,
		last: ACTION.NONE,
	};
}

/** What ZKMatches does when the turn passes. */
function passTurn(s: DuelState): DuelState {
	return {...s, actor: 1 - s.actor, ap: 2, turn: s.turn + 1};
}

const accepts = async (noir: Noir, inputs: Parameters<Noir['execute']>[0]) =>
	noir.execute(inputs).then(
		() => true,
		() => false,
	);

describe('duel', () => {
	let zk: ZK;
	let duel: Duel;
	before(async () => {
		zk = await createZK();
		duel = createDuel(zk, circuits);
	});
	after(async () => {
		await zk.destroy();
	});

	/** Verify a transition with the verifier its circuit index names. */
	async function verifies(t: Transition): Promise<boolean> {
		const name = (['duel_move', 'duel_shoot', 'duel_trap', 'duel_effect', 'duel_answer'] as const)[
			t.circuit
		];
		assert.equal(t.proof.publicInputs.length, 32, 'the whole state, before and after');
		return zk.prover(circuits[name]).verify(t.proof);
	}

	async function match(a: number, b: number) {
		const s0 = await duel.start(a);
		const s1 = await duel.start(b);
		return {
			state: fresh([s0.secret.commitment, s1.secret.commitment]),
			secrets: [s0.secret, s1.secret] as [DuelSecret, DuelSecret],
		};
	}

	it('commits exactly like the circuit does', async () => {
		// Same number as `duel_commitment_is_stable` in circuits/duel/src/lib.nr.
		const h = {room: 3, traps: [4, 5] as [number, number], charge: 6};
		assert.equal(pack(h), 0x06050403n);
		assert.equal(
			await duel.commit(h, 12345n),
			'0x0494854f2d6dd4323e87abf5d8b9d079ca04042a20efdd7c7abadec059636e37',
		);
	});

	it('the milestone C move table happens to be symmetric (data, not a rule)', () => {
		for (const a of ROOMS) for (const b of MOVES[a]) assert.ok(canMove(b, a), `${b} -> ${a}`);
	});

	it('agrees with the circuits on every move, drop, shot and listen (64 room pairs each)', async () => {
		const move = new Noir(circuits.duel_move);
		const shoot = new Noir(circuits.duel_shoot);
		const answer = new Noir(circuits.duel_answer);
		const other = await duel.commit(hiddenIn(1), 2n);
		for (const from of ROOMS) {
			const commitment = await duel.commit(hiddenIn(from), 1n);
			const state = fresh([commitment, other]);
			// seat 1 listened; seat 0, in `from`, answers
			const listened: DuelState = {...state, actor: 1, phase: PHASE.LISTEN, acted: 1};
			for (const to of ROOMS) {
				const newCommitment = await duel.commit(hiddenIn(to), 3n);
				const moveInputs = (action: number, next: DuelState) => ({
					state: stateInput(state),
					next: stateInput(next),
					hidden_state: hiddenInput(hiddenIn(from)),
					salt: '1',
					new_hidden: hiddenInput(hiddenIn(to)),
					new_salt: '3',
					action: String(action),
				});
				const after = {...state, commitments: [newCommitment, other] as [Hex, Hex], acted: 1};
				const moved = await accepts(
					move,
					moveInputs(ACTION.MOVE, {...after, ap: 1, last: ACTION.MOVE}),
				);
				assert.equal(moved, canMove(from, to), `move ${from} -> ${to}`);
				const dropped = await accepts(
					move,
					moveInputs(ACTION.DROP_DOWN, {...after, last: ACTION.DROP_DOWN, argA: 4, argB: 5}),
				);
				assert.equal(dropped, from === 4 && to === 5, `drop ${from} -> ${to}`);

				const shot = {
					...state,
					ap: 0,
					phase: PHASE.SHOT,
					argA: from,
					argB: to,
					acted: 1,
					last: ACTION.SHOOT,
				};
				const shotOk = await accepts(shoot, {
					state: stateInput(state),
					next: stateInput(shot),
					hidden_state: hiddenInput(hiddenIn(from)),
					salt: '1',
					target: String(to),
				});
				assert.equal(shotOk, canShoot(from, to), `shoot ${from} -> ${to}`);

				const heard = {...listened, phase: PHASE.PLAY, argB: to, last: ACTION.ANSWER};
				const named = await accepts(answer, {
					state: stateInput(listened),
					next: stateInput(heard),
					hidden_state: hiddenInput(hiddenIn(from)),
					salt: '1',
					new_hidden: hiddenInput(hiddenIn(from)),
					new_salt: '0',
					reveal: String(to),
				});
				assert.equal(named, canMove(from, to), `listen in ${from} names ${to}`);
			}
		}
	});

	it('proves a whole shot: shoot, a hit answered, the free move', async () => {
		const {state, secrets} = await match(4, 7);
		const shot = await duel.shoot(state, secrets[0], 7);
		assert.equal(shot.circuit, CIRCUIT.SHOOT);
		assert.deepEqual(shot.next, nextAfterShoot(state, 4, 7));
		assert.ok(await verifies(shot));

		const answer = await duel.answer(shot.next, secrets[1]);
		assert.equal(answer.hit, true);
		assert.deepEqual(answer.next.hits, [0, 1]);
		assert.equal(answer.secret, secrets[1], 'a shot does not move its target');
		assert.ok(await verifies(answer));

		const moved = await duel.move(answer.next, secrets[0], 2);
		assert.equal(moved.next.phase, PHASE.PLAY);
		assert.equal(moved.next.last, ACTION.FORCED_MOVE);
		assert.equal(moved.next.commitments[0], moved.secret.commitment);
		assert.ok(await verifies(moved));
	});

	it('proves a listen and its answer', async () => {
		const {state, secrets} = await match(1, 7);
		const listen = await duel.listen(state);
		assert.equal(listen.next.phase, PHASE.LISTEN);
		assert.ok(await verifies(listen));
		const answer = await duel.answer(listen.next, secrets[1], {reveal: 8});
		assert.deepEqual([answer.next.argA, answer.next.argB, answer.next.phase], [0, 8, PHASE.PLAY]);
		assert.ok(await verifies(answer));
	});

	it('proves traps: set two, replace one, detonate it on the opponent', async () => {
		const {state, secrets} = await match(6, 7);
		const one = await duel.setTrap(state, secrets[0]);
		assert.deepEqual(one.secret.traps, [6, 0]);
		assert.ok(await verifies(one));
		const walked = await duel.move(one.next, one.secret, 7);
		const two = await duel.setTrap(passTurn(passTurn(walked.next)), walked.secret);
		assert.deepEqual(two.secret.traps, [6, 7]);
		const s = passTurn(passTurn(two.next));
		const moved = await duel.move(s, two.secret, 5);
		const three = await duel.setTrap(moved.next, moved.secret, 6);
		assert.deepEqual(three.secret.traps, [5, 7]);
		assert.ok(await verifies(three));
		const boom = await duel.detonate(passTurn(passTurn(three.next)), three.secret, 7);
		assert.deepEqual(
			[boom.next.phase, boom.next.argB, boom.secret.traps],
			[PHASE.DETONATION, 7, [5, 0]],
		);
		assert.ok(await verifies(boom));
		const answer = await duel.answer(boom.next, secrets[1]);
		assert.equal(answer.hit, true);
		assert.equal(answer.next.phase, PHASE.PLAY);
		assert.ok(await verifies(answer));
	});

	it('proves a Remote Charge set, going off at the next turn, then Stim Rations', async () => {
		const {state, secrets} = await match(8, 6);
		const set = await duel.remoteCharge(state, secrets[0], 6);
		assert.deepEqual([set.next.armed, set.next.argA, set.secret.charge], [1, 8, 6]);
		assert.ok(await verifies(set));
		const toGalley = await duel.move(set.next, set.secret, 7);
		const s = passTurn(passTurn(toGalley.next));
		await assert.rejects(duel.move(s, toGalley.secret, 5), /the Remote Charge goes off first/);
		const fired = await duel.fireCharge(s, toGalley.secret);
		assert.deepEqual([fired.next.phase, fired.next.argB, fired.next.armed], [PHASE.CHARGE, 6, 0]);
		assert.ok(await verifies(fired));
		const answer = await duel.answer(fired.next, secrets[1]);
		assert.equal(answer.hit, true);
		assert.ok(await verifies(answer));
		// the charge did not count as acting; Stim needs the Galley, so walk
		// there first... which is acting: Stim is then refused
		const walked = await duel.move(answer.next, fired.secret, 5);
		await assert.rejects(duel.stimRations(walked.next, walked.secret), /start of the turn/);
		const stim = await duel.stimRations(passTurn(passTurn(walked.next)), walked.secret);
		assert.equal(stim.next.ap, 3);
		assert.ok(await verifies(stim));
	});

	it('proves a purge that hits, with the forced move inside the answer', async () => {
		const {state, secrets} = await match(1, 8);
		const purge = await duel.coolantPurge(state, secrets[0]);
		assert.deepEqual([purge.next.sealedRoom, purge.next.sealedTurn], [8, 1]);
		assert.ok(await verifies(purge));
		const answer = await duel.answer(purge.next, secrets[1], {to: 6});
		assert.equal(answer.hit, true);
		assert.equal(answer.secret.room, 6);
		assert.equal(answer.next.commitments[1], answer.secret.commitment);
		assert.ok(await verifies(answer));
	});

	it('proves a silent chute, the tracker, and the drop down', async () => {
		const {state, secrets} = await match(3, 5);
		const chute = await duel.maintenanceChute(state, secrets[0]);
		const dropped = await duel.answer(chute.next, secrets[1]);
		assert.equal(dropped.hit, false);
		assert.equal(dropped.secret.room, 8);
		assert.notEqual(dropped.next.commitments[1], state.commitments[1]);
		assert.ok(await verifies(dropped));

		const t = await match(7, 2);
		const track = await duel.motionTracker(t.state, t.secrets[0]);
		const found = await duel.answer(track.next, t.secrets[1]);
		assert.deepEqual([found.next.argA, found.next.argB], [1, 2]);
		assert.ok(await verifies(found));

		const g = await match(4, 2);
		const drop = await duel.dropDown(g.state, g.secrets[0]);
		assert.deepEqual([drop.next.argA, drop.next.argB, drop.next.ap], [4, 5, 2]);
		assert.ok(await verifies(drop));
	});

	it('cannot prove a lie about a shot or a listen', async () => {
		const {state, secrets} = await match(4, 7);
		const shot = await duel.shoot(state, secrets[0], 7);
		const truth = nextAfterAnswer(shot.next, secrets[1]).next;
		const answerInputs = (s: DuelState, next: DuelState, reveal: number) => ({
			state: stateInput(s),
			next: stateInput(next),
			hidden_state: hiddenInput(secrets[1]),
			salt: secrets[1].salt,
			new_hidden: hiddenInput(secrets[1]),
			new_salt: '0',
			reveal: String(reveal),
		});
		await assert.rejects(
			zk.prover(circuits.duel_answer).prove(answerInputs(shot.next, {...truth, hits: [0, 0]}, 0)),
		);
		const listen = await duel.listen(state);
		const lie = {...listen.next, phase: PHASE.PLAY, last: ACTION.ANSWER, argB: 1};
		await assert.rejects(zk.prover(circuits.duel_answer).prove(answerInputs(listen.next, lie, 1)));
		assert.throws(() => nextAfterAnswer(listen.next, secrets[1], {reveal: 1}), /next to yours/);
	});
});
