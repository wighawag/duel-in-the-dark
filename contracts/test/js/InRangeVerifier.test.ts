import {expect} from 'earl';
import {describe, it, before, after} from 'node:test';
import {network} from 'hardhat';
import {createZK, randomField, type ZK} from 'duel-in-the-dark-circuits';
import {circuits} from 'duel-in-the-dark-circuits/circuits';
import {setupFixtures} from './utils/index.js';

// The end-to-end guarantee of the circuits pipeline: a proof made by the same
// prover the web uses is accepted by the verifier the deploy scripts put on
// chain for that circuit, and the verifier really checks something.

const {provider, networkHelpers} = await network.connect();
const {deployAll} = setupFixtures(provider);

describe('InRangeVerifier', function () {
	let zk: ZK;
	before(async () => {
		zk = await createZK();
	});
	after(async () => {
		await zk.destroy();
	});

	async function proveInRange(value: bigint, max: bigint) {
		const salt = randomField();
		const commitment = await zk.commit([value, salt]);
		return zk.prover(circuits.in_range).prove({
			value: value.toString(),
			salt: salt.toString(),
			max: max.toString(),
			commitment,
		});
	}

	it('accepts a proof from the prover', async function () {
		const {env, InRangeVerifier} = await networkHelpers.loadFixture(deployAll);
		const {proof, publicInputs} = await proveInRange(5n, 8n);
		const ok = await env.read(InRangeVerifier, {
			functionName: 'verify',
			args: [proof, publicInputs],
		});
		expect(ok).toEqual(true);
	});

	it('rejects the proof against different public inputs', async function () {
		const {env, InRangeVerifier} = await networkHelpers.loadFixture(deployAll);
		const {proof, publicInputs} = await proveInRange(5n, 8n);
		// Claim the same proof shows the value is below 9: it does not.
		const tampered = [
			'0x0000000000000000000000000000000000000000000000000000000000000009' as const,
			publicInputs[1],
		];
		await expect(
			env.read(InRangeVerifier, {
				functionName: 'verify',
				args: [proof, tampered],
			}),
		).toBeRejected();
	});
});
