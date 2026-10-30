import {describe, it, expect, afterAll} from 'vitest';
import {get} from 'svelte/store';
import {createWalletClient, custom, parseEther} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {createContext} from '$lib/context/index';
import {createEmbeddedWorld, type EmbeddedWorld} from '$lib/embedded';
import {config, extensions} from 'template-zk-game-contracts/rocketh/config.js';
import deployVerifiers from 'template-zk-game-contracts/deploy/000_deploy_verifiers.js';
import deployGreetingsRegistry from 'template-zk-game-contracts/deploy/001_deploy_greetings_registry.js';
import deployHideAndSeek from 'template-zk-game-contracts/deploy/002_deploy_hide_and_seek.js';
import {createZK} from 'template-zk-game-circuits';
import {circuits} from 'template-zk-game-circuits/circuits';
import {createHideAndSeek} from 'template-zk-game-circuits/hide-and-seek';
import {createHideAndSeekGame} from '../../../src/routes/hide-and-seek/lib/game';
import {createSecretStore} from '../../../src/routes/hide-and-seek/lib/secrets';
import {roleIn} from '../../../src/routes/hide-and-seek/lib/view';

// The /hide-and-seek page's READ side against a real chain (an embedded world
// running the app's deploy scripts): two players play a match through the
// contract, with real proofs, and after each step the page's polling store
// and secret lookup must describe what actually happened. The contract tests
// cover the rules; the sending side mirrors routes/demo, covered by its e2e.

const KEYS = [
	'0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
	'0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
] as const;

let world: EmbeddedWorld | undefined;
afterAll(async () => {
	await world?.dispose();
});

function memoryStorage() {
	const map = new Map<string, string>();
	return {
		getItem: (k: string) => map.get(k) ?? null,
		setItem: (k: string, v: string) => void map.set(k, v),
	};
}

describe('/hide-and-seek against an embedded chain', () => {
	it('shows a match as it is played', {timeout: 180_000}, async () => {
		const accounts = KEYS.map((k) => privateKeyToAccount(k));
		world = await createEmbeddedWorld({
			chainId: 9007199254740125,
			chain: {
				name: 'Embedded',
				nativeCurrency: {name: 'Ether', symbol: 'ETH', decimals: 18},
			},
			rocketh: {config, extensions},
			scripts: [
				{id: '000_deploy_verifiers', module: deployVerifiers},
				{id: '001_deploy_greetings_registry', module: deployGreetingsRegistry},
				{id: '002_deploy_hide_and_seek', module: deployHideAndSeek},
			],
			accounts: {deployer: KEYS[0], admin: KEYS[1]},
			initialBalances: Object.fromEntries(
				accounts.map((a) => [a.address, 10n ** 24n]),
			),
		});
		const {context} = createContext({
			establishConnection: world.establishConnection,
		});
		const storage = memoryStorage();
		const game = createHideAndSeekGame(context, {storage});
		const deployments = world.deployments.get();
		const HideAndSeek = deployments.contracts.HideAndSeek;
		const wallets = accounts.map((account) =>
			createWalletClient({
				account,
				chain: context.publicClient.chain,
				transport: custom(world!.provider),
			}),
		);
		const secrets = accounts.map((a) =>
			createSecretStore(
				{
					chainId: deployments.chain.id,
					contract: HideAndSeek.address,
					player: a.address,
				},
				storage,
			),
		);
		async function send(
			seat: number,
			functionName: string,
			args: readonly unknown[],
			value?: bigint,
		) {
			const hash = await wallets[seat].writeContract({
				...HideAndSeek,
				functionName,
				args,
				...(value ? {value} : {}),
			} as Parameters<(typeof wallets)[0]['writeContract']>[0]);
			const receipt = await context.publicClient.waitForTransactionReceipt({
				hash,
			});
			expect(receipt.status).toBe('success');
		}
		async function latest() {
			const v = await game.view.update();
			if (v.step !== 'Loaded') throw new Error('not loaded');
			return v.matches[0];
		}

		const zk = await createZK();
		try {
			const client = createHideAndSeek(zk, circuits);
			const stake = parseEther('0.5');

			// Both hide, storing the secret first exactly as the page does.
			const a = await client.hide(1);
			secrets[0].put(a.secret);
			await send(
				0,
				'createMatch',
				[accounts[0].address, a.secret.commitment, a.proof.proof],
				stake,
			);
			let m = await latest();
			expect(m.status).toBe('Open');
			expect(roleIn(m, accounts[1].address, 0).canJoin).toBe(true);

			const b = await client.hide(5);
			secrets[1].put(b.secret);
			await send(
				1,
				'joinMatch',
				[m.id, accounts[1].address, b.secret.commitment, b.proof.proof],
				stake,
			);
			m = await latest();
			expect(m.status).toBe('Active');
			// Each player sees their own cell, from this browser's secrets.
			expect(game.myCell(m, accounts[0].address)).toBe(1);
			expect(game.myCell(m, accounts[1].address)).toBe(5);

			// The turn holder guesses the other's cell; the other must answer.
			const turn = m.turnSeat;
			const other = 1 - turn;
			const otherCell = other === 0 ? 1 : 5;
			await send(turn, 'guess', [m.id, accounts[turn].address, otherCell]);
			m = await latest();
			const now = Math.floor(Date.now() / 1000);
			expect(roleIn(m, accounts[other].address, now).mustAnswer).toBe(true);
			expect(m.pendingGuess).toBe(otherCell);

			const answer = await client.answer(
				other === 0 ? a.secret : b.secret,
				m.pendingGuess,
			);
			await send(other, 'answerGuess', [
				m.id,
				accounts[other].address,
				answer.hit,
				answer.proof.proof,
			]);
			m = await latest();
			expect(m.status).toBe('Finished');
			expect(roleIn(m, accounts[turn].address, now).won).toBe(true);
			expect(get(game.view).step).toBe('Loaded');
		} finally {
			await zk.destroy();
		}
	});
});
