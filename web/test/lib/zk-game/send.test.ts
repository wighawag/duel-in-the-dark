import {describe, it, expect} from 'vitest';
import {readable} from 'svelte/store';
import {
	GAS_HEADROOM_PERCENT,
	sendAsSigner,
	sendFromAccount,
	withGasHeadroom,
	type SendDeps,
} from '$lib/zk-game/send';

// QA F9: a limit equal to the estimate starves the proof verifier as soon as
// the block differs from the state it was estimated on (two first matches in
// one block). Every send here must carry headroom over the estimate.

const player = '0x00000000000000000000000000000000000000aa' as const;
const signer = '0x00000000000000000000000000000000000000bb' as const;

function deps(estimate: bigint) {
	const sent: {gas?: bigint}[] = [];
	const executor = (address: `0x${string}`) =>
		readable({
			status: 'ready',
			address,
			account: {address},
			client: {
				writeContract: async (request: {gas?: bigint}) => {
					sent.push(request);
					return '0x01' as const;
				},
			},
		});
	const d = {
		connection: Object.assign(readable({account: {address: player}}), {
			ensureConnected: async () => {},
		}),
		accountExecutor: executor(player),
		signerExecutor: executor(signer),
		accountBalance: {},
		signerBalance: {},
		delegationCheck: {ensureRegistered: async () => {}},
		balanceCheck: {
			ensureCanAfford: async ({contract}: {contract: object}) => ({
				...contract,
				gas: estimate,
			}),
		},
	} as unknown as SendDeps;
	return {deps: d, sent};
}

const build = () =>
	({
		address: '0x00000000000000000000000000000000000000cc',
		abi: [],
		functionName: 'createMatch',
		args: [],
	}) as never;

describe('gas headroom on zk-game sends', () => {
	it('is 10%', () => {
		expect(GAS_HEADROOM_PERCENT).toBe(10n);
		expect(withGasHeadroom({gas: 3_036_761n}).gas).toBe(3_340_437n);
	});

	it('leaves a request without gas alone', () => {
		const request: {gas?: bigint} = {};
		expect(withGasHeadroom(request).gas).toBeUndefined();
	});

	it('covers what a first-in-block createMatch needs over its estimate', () => {
		// Measured (QA F9): estimated 3,036,761 as the second match, mined
		// first it needs ~17.4k more for the zero slot, plus 1/64 of that kept
		// back from the verifier.
		const estimate = 3_036_761n;
		const needed = estimate + (17_400n * 64n) / 63n;
		expect(withGasHeadroom({gas: estimate}).gas! > needed).toBe(true);
	});

	it('sends from the account with the padded gas', async () => {
		const {deps: d, sent} = deps(1_000_000n);
		const result = await sendFromAccount(d, build);
		expect(result).toEqual({status: 'submitted', hash: '0x01'});
		expect(sent.map((r) => r.gas)).toEqual([1_100_000n]);
	});

	it('sends as the signer with the padded gas', async () => {
		const {deps: d, sent} = deps(1_000_000n);
		const result = await sendAsSigner(d, 'Move', build);
		expect(result).toEqual({status: 'submitted', hash: '0x01'});
		expect(sent.map((r) => r.gas)).toEqual([1_100_000n]);
	});
});
