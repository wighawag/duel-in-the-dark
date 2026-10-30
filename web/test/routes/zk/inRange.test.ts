import {describe, it, expect, afterAll} from 'vitest';
import {get} from 'svelte/store';
import {createContext} from '$lib/context/index';
import {createEmbeddedWorld, type EmbeddedWorld} from '$lib/embedded';
import {config, extensions} from 'template-zk-game-contracts/rocketh/config.js';
import deployVerifiers from 'template-zk-game-contracts/deploy/000_deploy_verifiers.js';
import deployGreetingsRegistry from 'template-zk-game-contracts/deploy/001_deploy_greetings_registry.js';
import {createInRangeDemo} from '../../../src/routes/zk/lib/inRange';

// The /zk page's own logic against a real chain: an embedded world (a node
// in-process, the app's real verifier deploy script) and the same prover the
// page uses. Nothing between the store and the verifier contract is mocked, so
// this is the in-browser flow minus the DOM. The browser half (that the wasm
// prover loads in chromium) is test/lib/zk/prover.svelte.test.ts.

const DEPLOYER =
	'0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const ADMIN =
	'0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;

let world: EmbeddedWorld | undefined;
afterAll(async () => {
	await world?.dispose();
});

async function demoOnAChain() {
	world ??= await createEmbeddedWorld({
		chainId: 9007199254740124,
		chain: {
			name: 'Embedded',
			nativeCurrency: {name: 'Ether', symbol: 'ETH', decimals: 18},
		},
		rocketh: {config, extensions},
		scripts: [
			{id: '000_deploy_verifiers', module: deployVerifiers},
			{id: '001_deploy_greetings_registry', module: deployGreetingsRegistry},
		],
		accounts: {deployer: DEPLOYER, admin: ADMIN},
		initialBalances: {
			'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266': 10n ** 24n,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8': 10n ** 24n,
		},
	});
	const {context} = createContext({
		establishConnection: world.establishConnection,
	});
	return createInRangeDemo(context);
}

describe('/zk in-range demo', () => {
	it(
		'commits, proves and is accepted by the verifier on chain',
		{timeout: 120_000},
		async () => {
			const demo = await demoOnAChain();
			await demo.commit(5);
			expect(get(demo).step).toBe('committed');
			await demo.prove(8);
			expect(get(demo).step).toBe('proved');
			await demo.verifyOnChain();
			const state = get(demo);
			expect(state.step === 'checked' && state.onChain).toBe(true);
		},
	);

	it('cannot prove a value outside the range', {timeout: 120_000}, async () => {
		const demo = await demoOnAChain();
		await demo.commit(9);
		await demo.prove(8);
		expect(get(demo).step).toBe('error');
	});
});
