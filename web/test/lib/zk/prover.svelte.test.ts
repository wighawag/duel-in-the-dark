import {describe, it, expect} from 'vitest';
import {getZK, getCircuits, randomField} from '$lib/zk';

// Runs in the `client` project, i.e. in a real headless chromium: the point is
// that the wasm prover loads and proves under the browser build of bb.js and
// noir_js, without cross-origin isolation, exactly as a static/IPFS deployment
// serves it. Node-side proving is covered in circuits/test and contracts/test.

describe('browser prover', () => {
	it(
		'proves and verifies in_range in the browser',
		{timeout: 120_000},
		async () => {
			const zk = await getZK();
			const circuits = await getCircuits();
			const salt = randomField();
			const commitment = await zk.commit([5n, salt]);
			const prover = zk.prover(circuits.in_range);
			const proof = await prover.prove({
				value: '5',
				salt: salt.toString(),
				max: '8',
				commitment,
			});
			expect(proof.publicInputs.map(BigInt)).toEqual([8n, BigInt(commitment)]);
			expect(await prover.verify(proof)).toBe(true);
		},
	);

	it('commits exactly like the circuit does', async () => {
		const zk = await getZK();
		expect(await zk.commit([3n, 12345n])).toBe(
			'0x227735108cd5c0afb4afc8fa7e1ce1863afd0b043188d437df9e960f2f52f561',
		);
	});

	it('hands every caller the same prover', async () => {
		expect(await getZK()).toBe(await getZK());
	});
});
