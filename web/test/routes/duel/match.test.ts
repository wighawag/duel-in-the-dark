import {describe, it, expect, afterAll} from 'vitest';
import {get, readable} from 'svelte/store';
import {createWalletClient, custom, parseEther} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {createContext} from '$lib/context/index';
import {createEmbeddedWorld, type EmbeddedWorld} from '$lib/embedded';
import {config, extensions} from 'duel-in-the-dark-contracts/rocketh/config.js';
import {createZK} from 'duel-in-the-dark-circuits';
import {circuits} from 'duel-in-the-dark-circuits/circuits';
import {createDuel, type DuelSecret} from 'duel-in-the-dark-circuits/duel';
import {createDuelGame} from '../../../src/routes/duel/lib/game';
import {createDuelState} from '$lib/duel/state';
import {createSecretStore} from '../../../src/routes/duel/lib/secrets';
import {roleIn} from '../../../src/routes/duel/lib/view';
import {GAME_SCRIPTS} from '../../lib/game-world';

// The /duel page's READ side against a real chain (an embedded world running
// the app's deploy scripts): two players play a shot through the contract,
// with real proofs, and after each step the page's polling store and secret
// lookup must describe what actually happened. The contract tests cover the
// rules; the sending side is the e2e (web/e2e/tests/duel.e2e.ts).

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

describe('/duel against an embedded chain', () => {
	it('shows a match as it is played', {timeout: 180_000}, async () => {
		const accounts = KEYS.map((k) => privateKeyToAccount(k));
		world = await createEmbeddedWorld({
			chainId: 9007199254740126,
			chain: {
				name: 'Embedded',
				nativeCurrency: {name: 'Ether', symbol: 'ETH', decimals: 18},
			},
			rocketh: {config, extensions},
			scripts: GAME_SCRIPTS,
			accounts: {deployer: KEYS[0], admin: KEYS[1]},
			initialBalances: Object.fromEntries(
				accounts.map((a) => [a.address, 10n ** 24n]),
			),
		});
		const {context} = createContext({
			establishConnection: world.establishConnection,
		});
		const storage = memoryStorage();
		// The app's onchainState, built as $lib/duel/app.ts builds it but without
		// the fetch gate: nothing is connected here, and the gate (correctly)
		// keeps an unconnected app from reading.
		const onchainState = createDuelState({
			publicClient: context.publicClient,
			deployments: context.deployments,
			account: readable(undefined),
		});
		const game = createDuelGame({...context, onchainState}, {storage});
		const deployments = world.deployments.get();
		const Duel = deployments.contracts.Duel;
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
					contract: Duel.address,
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
				...Duel,
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
			const client = createDuel(zk, circuits);
			const stake = parseEther('0.5');
			const mine: DuelSecret[] = [];

			const a = await client.start(4);
			secrets[0].put(a.secret);
			mine.push(a.secret);
			await send(
				0,
				'createMatch',
				[accounts[0].address, a.secret.commitment, a.proof.proof],
				stake,
			);
			let m = await latest();
			expect(m.status).toBe('Open');
			expect(roleIn(m, accounts[1].address, 0).canJoin).toBe(true);

			const b = await client.start(7);
			secrets[1].put(b.secret);
			mine.push(b.secret);
			await send(
				1,
				'joinMatch',
				[m.id, accounts[1].address, b.secret.commitment, b.proof.proof],
				stake,
			);
			m = await latest();
			expect(m.status).toBe('Active');
			// Each player sees their own room, from this browser's secrets.
			expect(game.myRoom(m, accounts[0].address)).toBe(4);
			expect(game.myRoom(m, accounts[1].address)).toBe(7);
			expect(m.board.commitments).toEqual([
				a.secret.commitment,
				b.secret.commitment,
			]);

			// The turn holder shoots where the other is (the Gantry sees the Cargo
			// Hold, and the Cargo Hold sees nothing of the Gantry, so whoever has
			// the turn shoots into the other's room if it can, else moves).
			const turn = m.board.actor;
			const other = 1 - turn;
			const now = Math.floor(Date.now() / 1000);
			if (turn === 0) {
				const shot = await client.shoot(m.board, mine[0], 7);
				await send(0, 'shoot', [
					m.id,
					accounts[0].address,
					shot.next,
					shot.proof.proof,
				]);
				m = await latest();
				expect(roleIn(m, accounts[1].address, now)).toMatchObject({
					mustAnswer: true,
					shot: {from: 4, into: 7, byMe: false},
				});
				const answer = await client.answerShot(m.board, mine[1]);
				expect(answer.hit).toBe(true);
				await send(1, 'answerShot', [
					m.id,
					accounts[1].address,
					answer.next,
					answer.proof.proof,
				]);
				m = await latest();
				expect(roleIn(m, accounts[0].address, now)).toMatchObject({
					mustMoveAfterShot: true,
					theirHits: 1,
				});
				const moved = await client.move(m.board, mine[0], 2);
				secrets[0].put(moved.secret);
				await send(0, 'move', [
					m.id,
					accounts[0].address,
					moved.next,
					moved.proof.proof,
				]);
				m = await latest();
				expect(game.myRoom(m, accounts[0].address)).toBe(2);
				expect(roleIn(m, accounts[1].address, now).myTurn).toBe(true);
			} else {
				const moved = await client.move(m.board, mine[1], 8);
				secrets[1].put(moved.secret);
				await send(1, 'move', [
					m.id,
					accounts[1].address,
					moved.next,
					moved.proof.proof,
				]);
				m = await latest();
				expect(game.myRoom(m, accounts[1].address)).toBe(8);
				expect(m.board.ap).toBe(1);
				expect(roleIn(m, accounts[other].address, now).myTurn).toBe(false);
			}
			expect(get(game.view).step).toBe('Loaded');
		} finally {
			await zk.destroy();
		}
	});
});
