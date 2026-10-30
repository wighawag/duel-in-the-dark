import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {createZK, randomField, FIELD_MODULUS, type ZK} from '../src/index.js';
import {circuits} from '../generated/index.js';

describe('prover', () => {
	let zk: ZK;
	before(async () => {
		zk = await createZK();
	});
	after(async () => {
		await zk.destroy();
	});

	it('commits exactly like the circuit does', async () => {
		// Same number as `commitment_is_stable` in in_range/src/main.nr.
		assert.equal(
			await zk.commit([3n, 12345n]),
			'0x227735108cd5c0afb4afc8fa7e1ce1863afd0b043188d437df9e960f2f52f561',
		);
	});

	it('proves and verifies a value in range', async () => {
		const salt = randomField();
		const commitment = await zk.commit([5n, salt]);
		const prover = zk.prover(circuits.in_range);
		const proof = await prover.prove({value: '5', salt: salt.toString(), max: '8', commitment});
		assert.deepEqual(proof.publicInputs.map(BigInt), [8n, BigInt(commitment)]);
		assert.equal(await prover.verify(proof), true);
	});

	it('cannot prove a value out of range', async () => {
		const salt = randomField();
		const commitment = await zk.commit([8n, salt]);
		await assert.rejects(
			zk.prover(circuits.in_range).prove({value: '8', salt: salt.toString(), max: '8', commitment}),
		);
	});

	it('draws salts inside the field', () => {
		for (let i = 0; i < 100; i++) assert.ok(randomField() < FIELD_MODULUS);
	});
});
