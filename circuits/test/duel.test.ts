import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {Noir} from '@noir-lang/noir_js';
import {createZK, type ZK, type Hex} from '../src/index.js';
import {
	createDuel,
	canMove,
	canShoot,
	hiddenIn,
	nextAfterAnswer,
	nextAfterShoot,
	pack,
	stateInput,
	PHASE,
	MOVES,
	ROOMS,
	type Duel,
	type DuelState,
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
	};
}

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

	it('agrees with the circuits on every move and every shot (64 room pairs each)', async () => {
		const move = new Noir(circuits.duel_move);
		const shoot = new Noir(circuits.duel_shoot);
		const accepts = async (noir: Noir, inputs: Parameters<Noir['execute']>[0]) =>
			noir.execute(inputs).then(
				() => true,
				() => false,
			);
		const other = await duel.commit(hiddenIn(1), 2n);
		for (const from of ROOMS) {
			const commitment = await duel.commit(hiddenIn(from), 1n);
			const state = fresh([commitment, other]);
			for (const to of ROOMS) {
				const newCommitment = await duel.commit(hiddenIn(to), 3n);
				const next: DuelState = {...state, ap: 1, commitments: [newCommitment, other]};
				const moved = await accepts(move, {
					state: stateInput(state),
					next: stateInput(next),
					hidden_state: {room: String(from), traps: ['0', '0'], charge: '0'},
					salt: '1',
					new_hidden: {room: String(to), traps: ['0', '0'], charge: '0'},
					new_salt: '3',
				});
				assert.equal(moved, canMove(from, to), `move ${from} -> ${to}`);

				const shot = {...state, ap: 0, phase: PHASE.SHOT, argA: from, argB: to};
				const shotOk = await accepts(shoot, {
					state: stateInput(state),
					next: stateInput(shot),
					hidden_state: {room: String(from), traps: ['0', '0'], charge: '0'},
					salt: '1',
					target: String(to),
				});
				assert.equal(shotOk, canShoot(from, to), `shoot ${from} -> ${to}`);
			}
		}
	});

	it('proves a whole shot: shoot, a hit answered, the free move', async () => {
		const a = await duel.start(4);
		const b = await duel.start(7);
		assert.deepEqual(a.proof.publicInputs.map(BigInt), [BigInt(a.secret.commitment)]);
		assert.ok(await zk.prover(circuits.duel_start).verify(a.proof));

		const s0 = fresh([a.secret.commitment, b.secret.commitment]);
		const shot = await duel.shoot(s0, a.secret, 7);
		assert.equal(shot.proof.publicInputs.length, 20);
		assert.deepEqual(shot.next, nextAfterShoot(s0, 4, 7));
		assert.ok(await zk.prover(circuits.duel_shoot).verify(shot.proof));

		const answer = await duel.answerShot(shot.next, b.secret);
		assert.equal(answer.hit, true);
		assert.deepEqual(answer.next.hits, [0, 1]);
		assert.deepEqual(answer.next, nextAfterAnswer(shot.next, 7));
		assert.ok(await zk.prover(circuits.duel_answer_shot).verify(answer.proof));

		const moved = await duel.move(answer.next, a.secret, 2);
		assert.equal(moved.next.phase, PHASE.PLAY);
		assert.equal(moved.next.ap, 0);
		assert.equal(moved.next.commitments[0], moved.secret.commitment);
		assert.ok(await zk.prover(circuits.duel_move).verify(moved.proof));
	});

	it('cannot prove a lie about a shot', async () => {
		const a = await duel.start(4);
		const b = await duel.start(7);
		const shot = await duel.shoot(fresh([a.secret.commitment, b.secret.commitment]), a.secret, 7);
		const truth = nextAfterAnswer(shot.next, 7);
		await assert.rejects(
			zk.prover(circuits.duel_answer_shot).prove({
				state: stateInput(shot.next),
				next: stateInput({...truth, hits: [0, 0]}),
				hidden_state: {room: '7', traps: ['0', '0'], charge: '0'},
				salt: b.secret.salt,
			}),
		);
	});
});
