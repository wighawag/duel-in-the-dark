import {get, writable, type Readable} from 'svelte/store';
import type {Context} from '$lib/context/types';
import type {GameStateStore, MatchSummary} from '$lib/game/state';
import {getZK, getCircuits} from '$lib/zk';
import type {
	HideAndSeek,
	HideAndSeekSecret,
} from 'template-zk-game-circuits/hide-and-seek';
import {createSecretStore, type SecretStore} from './secrets';
import {
	currentPlayer,
	sendAsSigner as sendAsSignerTo,
	sendFromAccount as sendFromAccountTo,
	type SendDeps,
	type SendResult,
	type WriteRequest,
} from '$lib/zk-game/send';

/**
 * The reference game's client: what the /hide-and-seek page shows and does.
 *
 * Reads are the app context's `onchainState` (see $lib/game). Every action is a
 * method that proves what it has to (in the browser), stores any new secret
 * BEFORE sending (see secrets.ts), sends through the right executor (see
 * send.ts) and refreshes. The page renders this and wires buttons to it.
 */

export {STATUS} from '$lib/game/state';
export type {MatchStatus, MatchSummary, GameView} from '$lib/game/state';

export type Activity =
	| {step: 'idle'}
	| {step: 'proving' | 'sending'; action: string}
	| {step: 'done'; action: string; result: SendResult}
	| {step: 'failed'; action: string; message: string};

export type HideAndSeekGame = {
	/** the app context's onchainState: the game's matches, polled */
	view: GameStateStore;
	activity: Readable<Activity>;
	/** The seat `player` holds in `match`, if any. */
	seatOf(match: MatchSummary, player: string | undefined): number | undefined;
	/** The player's own hidden cell in `match`, read from this browser's secrets. */
	myCell(match: MatchSummary, player: string | undefined): number | undefined;
	create(cell: number, stake: bigint): Promise<void>;
	join(match: MatchSummary, cell: number): Promise<void>;
	move(match: MatchSummary, direction: 1 | -1): Promise<void>;
	guess(match: MatchSummary, cell: number): Promise<void>;
	answer(match: MatchSummary): Promise<void>;
	endTurn(match: MatchSummary): Promise<void>;
	claimTimeout(match: MatchSummary): Promise<void>;
	cancel(match: MatchSummary): Promise<void>;
	withdraw(): Promise<void>;
	exportSecrets(): Promise<string>;
	importSecrets(json: string): Promise<number>;
};

export function createHideAndSeekGame(
	context: SendDeps &
		Pick<Context, 'publicClient' | 'deployments' | 'onchainState'>,
	options: {
		/** where secrets are kept; the browser's localStorage unless a test says otherwise */
		storage?: Pick<Storage, 'getItem' | 'setItem'>;
	} = {},
): HideAndSeekGame {
	const contract = () => context.deployments.get().contracts.HideAndSeek;
	type GameAbi = ReturnType<typeof contract>['abi'];
	// Bound to the game's ABI, so every call below is checked against it.
	const sendFromAccount = (
		deps: SendDeps,
		build: (player: `0x${string}`) => WriteRequest<GameAbi>,
	) => sendFromAccountTo<GameAbi>(deps, build);
	const sendAsSigner = (
		deps: SendDeps,
		action: string,
		build: (player: `0x${string}`) => WriteRequest<GameAbi>,
	) => sendAsSignerTo<GameAbi>(deps, action, build);

	const view = context.onchainState;

	const activity = writable<Activity>({step: 'idle'});

	let game: Promise<HideAndSeek> | undefined;
	function prover(): Promise<HideAndSeek> {
		game ??= Promise.all([
			getZK(),
			getCircuits(),
			import('template-zk-game-circuits/hide-and-seek'),
		]).then(([zk, circuits, {createHideAndSeek}]) =>
			createHideAndSeek(zk, circuits),
		);
		return game;
	}

	function secretsFor(player: string): SecretStore {
		const {chain} = context.deployments.get();
		return createSecretStore(
			{chainId: chain.id, contract: contract().address, player},
			options.storage ?? localStorage,
		);
	}

	function seatOf(match: MatchSummary, player: string | undefined) {
		if (!player) return undefined;
		const i = match.seats.findIndex(
			(s) => s.player.toLowerCase() === player.toLowerCase(),
		);
		return i < 0 ? undefined : i;
	}

	function mySecret(
		match: MatchSummary,
		player: string,
	): HideAndSeekSecret | undefined {
		const seat = seatOf(match, player);
		return seat === undefined
			? undefined
			: secretsFor(player).get(match.seats[seat].commitment);
	}

	/** Run one action: prove (optional), send, report, refresh. */
	async function run(
		action: string,
		steps: (player: `0x${string}`) => Promise<SendResult>,
	) {
		activity.set({step: 'proving', action});
		try {
			const player = await currentPlayer(context);
			if (!player) {
				activity.set({step: 'idle'});
				return;
			}
			const result = await steps(player);
			activity.set({step: 'done', action, result});
		} catch (error) {
			activity.set({
				step: 'failed',
				action,
				message: error instanceof Error ? error.message : String(error),
			});
		}
		void view.update();
	}

	const sending = (action: string) => activity.set({step: 'sending', action});

	function requireSecret(match: MatchSummary, player: string) {
		const secret = mySecret(match, player);
		if (!secret) {
			throw new Error(
				'This browser does not hold the secret for this match. Import your backup to keep playing.',
			);
		}
		return secret;
	}

	return {
		view,
		activity,
		seatOf,
		myCell(match, player) {
			return player ? mySecret(match, player)?.cell : undefined;
		},

		create(cell, stake) {
			return run('Create a match', async (player) => {
				const {secret, proof} = await (await prover()).hide(cell);
				secretsFor(player).put(secret);
				sending('Create a match');
				return sendFromAccount(context, (p) => ({
					...contract(),
					functionName: 'createMatch',
					args: [p, secret.commitment, proof.proof],
					value: stake,
				}));
			});
		},

		join(match, cell) {
			return run('Join the match', async (player) => {
				const {secret, proof} = await (await prover()).hide(cell);
				secretsFor(player).put(secret);
				sending('Join the match');
				return sendFromAccount(context, (p) => ({
					...contract(),
					functionName: 'joinMatch',
					args: [match.id, p, secret.commitment, proof.proof],
					value: match.stake,
				}));
			});
		},

		move(match, direction) {
			return run('Move', async (player) => {
				const {secret, proof} = await (
					await prover()
				).move(requireSecret(match, player), direction);
				secretsFor(player).put(secret);
				sending('Move');
				return sendAsSigner(context, 'Move', (p) => ({
					...contract(),
					functionName: 'move',
					args: [match.id, p, secret.commitment, proof.proof],
				}));
			});
		},

		guess(match, cell) {
			return run('Guess', async () => {
				sending('Guess');
				return sendAsSigner(context, 'Guess', (p) => ({
					...contract(),
					functionName: 'guess',
					args: [match.id, p, cell],
				}));
			});
		},

		answer(match) {
			return run('Answer the guess', async (player) => {
				const {hit, proof} = await (
					await prover()
				).answer(requireSecret(match, player), match.pendingGuess);
				sending('Answer the guess');
				return sendAsSigner(context, 'Answer the guess', (p) => ({
					...contract(),
					functionName: 'answerGuess',
					args: [match.id, p, hit, proof.proof],
				}));
			});
		},

		endTurn(match) {
			return run('End the turn', async () => {
				sending('End the turn');
				return sendAsSigner(context, 'End the turn', (p) => ({
					...contract(),
					functionName: 'endTurn',
					args: [match.id, p],
				}));
			});
		},

		claimTimeout(match) {
			return run('Claim the timeout', async () => {
				sending('Claim the timeout');
				return sendAsSigner(context, 'Claim the timeout', () => ({
					...contract(),
					functionName: 'claimTimeout',
					args: [match.id],
				}));
			});
		},

		cancel(match) {
			return run('Cancel the match', async () => {
				sending('Cancel the match');
				return sendFromAccount(context, (p) => ({
					...contract(),
					functionName: 'cancelMatch',
					args: [match.id, p],
				}));
			});
		},

		withdraw() {
			return run('Withdraw', async () => {
				sending('Withdraw');
				return sendFromAccount(context, () => ({
					...contract(),
					functionName: 'withdraw',
				}));
			});
		},

		async exportSecrets() {
			const player = await currentPlayer(context);
			return player ? secretsFor(player).exportAll() : '{}';
		},

		async importSecrets(json) {
			const player = await currentPlayer(context);
			return player ? secretsFor(player).importAll(json) : 0;
		},
	};
}
