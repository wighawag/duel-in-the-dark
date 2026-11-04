import {writable, type Readable} from 'svelte/store';
import type {Context} from '$lib/context/types';
import type {DuelStateStore, MatchSummary} from '$lib/duel/state';
import {getZK, getCircuits} from '$lib/zk';
import type {
	AnswerChoice,
	Duel,
	DuelSecret,
	DuelState,
	Transition,
} from 'duel-in-the-dark-circuits/duel';
import {createSecretStore, type SecretStore} from './secrets';
import {createHistory, type Ending, type HistoryEntry} from './history';
import {seatOf, type PickMode} from './view';
import {
	currentPlayer,
	sendAsSigner as sendAsSignerTo,
	sendFromAccount as sendFromAccountTo,
	type SendDeps,
	type SendResult,
	type WriteRequest,
} from '$lib/zk-game/send';

/**
 * duel-in-the-dark's client: what the /duel page shows and does.
 *
 * Reads are the app context's `onchainState` (see $lib/duel). Every action
 * proves what it has to (in the browser) against the state the chain holds
 * RIGHT NOW (read fresh, not from the polled view, so a proof is never made
 * for a state that already moved on), stores any new secret BEFORE sending
 * (see $lib/zk-game/secrets), sends through the right executor (see
 * $lib/zk-game/send) and refreshes. The page renders this and wires clicks.
 */

export type {MatchStatus, MatchSummary, GameView} from '$lib/duel/state';

export type Activity =
	| {step: 'idle'}
	| {step: 'proving' | 'sending'; action: string}
	| {step: 'done'; action: string; result: SendResult}
	| {step: 'failed'; action: string; message: string};

export type DuelGame = {
	/** the app context's onchainState: the game's matches, polled */
	view: DuelStateStore;
	activity: Readable<Activity>;
	/** the watched match's history, from its `Acted` events */
	history: Readable<HistoryEntry[]>;
	/** how the watched match ended, once it has (its `MatchFinished` event) */
	ending: Readable<Ending | undefined>;
	/** which match `history` follows (undefined: none) */
	watch(matchId: bigint | undefined): void;
	/** The player's own hidden room in `match`, read from this browser's secrets. */
	myRoom(match: MatchSummary, player: string | undefined): number | undefined;
	/** The player's whole hidden state in `match` (room, traps, charge). */
	mySecret(
		match: MatchSummary,
		player: string | undefined,
	): DuelSecret | undefined;
	create(room: number, stake: bigint): Promise<void>;
	join(match: MatchSummary, room: number): Promise<void>;
	/** a move during play, or the free move after a shot */
	move(match: MatchSummary, to: number): Promise<void>;
	dropDown(match: MatchSummary): Promise<void>;
	shoot(match: MatchSummary, target: number): Promise<void>;
	listen(match: MatchSummary): Promise<void>;
	/** a trap here; with two set, `replace` is the room of the one it replaces */
	setTrap(match: MatchSummary, replace?: number): Promise<void>;
	detonate(match: MatchSummary, room: number): Promise<void>;
	remoteCharge(match: MatchSummary, room: number): Promise<void>;
	fireCharge(match: MatchSummary): Promise<void>;
	coolantPurge(match: MatchSummary): Promise<void>;
	maintenanceChute(match: MatchSummary): Promise<void>;
	stimRations(match: MatchSummary): Promise<void>;
	motionTracker(match: MatchSummary): Promise<void>;
	/** answer the pending query; `choice` is what the rules leave to the player */
	answer(match: MatchSummary, choice?: AnswerChoice): Promise<void>;
	/** what clicking `room` does in pick mode `mode` (not 'start': no match yet) */
	pick(match: MatchSummary, mode: PickMode, room: number): Promise<void>;
	endTurn(match: MatchSummary): Promise<void>;
	claimTimeout(match: MatchSummary): Promise<void>;
	cancel(match: MatchSummary): Promise<void>;
	withdraw(): Promise<void>;
	exportSecrets(): Promise<string>;
	importSecrets(json: string): Promise<number>;
};

export function createDuelGame(
	context: SendDeps &
		Pick<Context, 'publicClient' | 'deployments' | 'onchainState'>,
	options: {
		/** where secrets are kept; the browser's localStorage unless a test says otherwise */
		storage?: Pick<Storage, 'getItem' | 'setItem'>;
	} = {},
): DuelGame {
	const contract = () => context.deployments.get().contracts.Duel;
	type GameAbi = ReturnType<typeof contract>['abi'];
	const sendFromAccount = (
		build: (player: `0x${string}`) => WriteRequest<GameAbi>,
	) => sendFromAccountTo<GameAbi>(context, build);
	const sendAsSigner = (
		action: string,
		build: (player: `0x${string}`) => WriteRequest<GameAbi>,
	) => sendAsSignerTo<GameAbi>(context, action, build);

	const view = context.onchainState;
	const activity = writable<Activity>({step: 'idle'});

	let duel: Promise<Duel> | undefined;
	function prover(): Promise<Duel> {
		duel ??= Promise.all([
			getZK(),
			getCircuits(),
			import('duel-in-the-dark-circuits/duel'),
		]).then(([zk, circuits, {createDuel}]) => createDuel(zk, circuits));
		return duel;
	}

	function secretsFor(player: string): SecretStore {
		const {chain} = context.deployments.get();
		return createSecretStore(
			{chainId: chain.id, contract: contract().address, player},
			options.storage ?? localStorage,
		);
	}

	function mySecret(
		match: MatchSummary,
		player: string | undefined,
	): DuelSecret | undefined {
		if (!player) return undefined;
		const seat = seatOf(match, player);
		return seat === undefined
			? undefined
			: secretsFor(player).get(match.seats[seat].commitment);
	}

	async function freshState(match: MatchSummary): Promise<DuelState> {
		const s = await context.publicClient.readContract({
			...contract(),
			functionName: 'getState',
			args: [match.id],
		});
		return {
			...s,
			commitments: [s.commitments[0], s.commitments[1]],
			hits: [s.hits[0], s.hits[1]],
		};
	}

	function requireSecret(state: DuelState, seat: number, player: string) {
		const secret = secretsFor(player).get(state.commitments[seat]);
		if (!secret) {
			throw new Error(
				'This browser does not hold the secret for this match. Import your backup to keep playing.',
			);
		}
		return secret;
	}

	function requireSeat(match: MatchSummary, player: string) {
		const seat = seatOf(match, player);
		if (seat === undefined) throw new Error('You are not in this match.');
		return seat;
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

	/**
	 * One proven transition: read the state the chain holds now, prove with
	 * this player's secret (`prove` gets it), keep any new secret BEFORE
	 * sending, and send it to `act`.
	 */
	function transition(
		action: string,
		match: MatchSummary,
		prove: (
			duel: Duel,
			state: DuelState,
			secret: DuelSecret,
		) => Promise<Transition & {secret?: DuelSecret}>,
	) {
		return run(action, async (player) => {
			const state = await freshState(match);
			const seat = requireSeat(match, player);
			const t = await prove(
				await prover(),
				state,
				requireSecret(state, seat, player),
			);
			if (t.secret) secretsFor(player).put(t.secret);
			sending(action);
			return sendAsSigner(action, (p) => ({
				...contract(),
				functionName: 'act',
				args: [match.id, p, t.circuit, t.next, t.proof.proof],
			}));
		});
	}

	const history = createHistory({
		publicClient: context.publicClient,
		contract,
	});

	const api: DuelGame = {
		view,
		activity,
		history,
		ending: history.ending,
		watch: (matchId) => history.watch(matchId),
		myRoom(match, player) {
			return mySecret(match, player)?.room;
		},
		mySecret,

		create(room, stake) {
			return run('Create a match', async (player) => {
				const {secret, proof} = await (await prover()).start(room);
				secretsFor(player).put(secret);
				sending('Create a match');
				return sendFromAccount((p) => ({
					...contract(),
					functionName: 'createMatch',
					args: [p, secret.commitment, proof.proof],
					value: stake,
				}));
			});
		},

		join(match, room) {
			return run('Join the match', async (player) => {
				const {secret, proof} = await (await prover()).start(room);
				secretsFor(player).put(secret);
				sending('Join the match');
				return sendFromAccount((p) => ({
					...contract(),
					functionName: 'joinMatch',
					args: [match.id, p, secret.commitment, proof.proof],
					value: match.stake,
				}));
			});
		},

		move: (match, to) =>
			transition('Move', match, (d, s, x) => d.move(s, x, to)),
		dropDown: (match) =>
			transition('Drop Down', match, (d, s, x) => d.dropDown(s, x)),
		shoot: (match, target) =>
			transition('Shoot', match, (d, s, x) => d.shoot(s, x, target)),
		listen: (match) => transition('Listen', match, (d, s) => d.listen(s)),
		setTrap: (match, replace) =>
			transition('Set a trap', match, (d, s, x) => d.setTrap(s, x, replace)),
		detonate: (match, room) =>
			transition('Detonate', match, (d, s, x) => d.detonate(s, x, room)),
		remoteCharge: (match, room) =>
			transition('Remote Charge', match, (d, s, x) =>
				d.remoteCharge(s, x, room),
			),
		fireCharge: (match) =>
			transition('Set off the Remote Charge', match, (d, s, x) =>
				d.fireCharge(s, x),
			),
		coolantPurge: (match) =>
			transition('Coolant Purge', match, (d, s, x) => d.coolantPurge(s, x)),
		maintenanceChute: (match) =>
			transition('Maintenance Chute', match, (d, s, x) =>
				d.maintenanceChute(s, x),
			),
		stimRations: (match) =>
			transition('Stim Rations', match, (d, s, x) => d.stimRations(s, x)),
		motionTracker: (match) =>
			transition('Motion Tracker', match, (d, s, x) => d.motionTracker(s, x)),
		answer: (match, choice) =>
			transition('Answer', match, (d, s, x) => d.answer(s, x, choice)),

		pick(match, mode, room) {
			switch (mode) {
				case 'move':
					return api.move(match, room);
				case 'shoot':
					return api.shoot(match, room);
				case 'detonate':
					return api.detonate(match, room);
				case 'charge':
					return api.remoteCharge(match, room);
				case 'replace':
					return api.setTrap(match, room);
				case 'reveal':
					return api.answer(match, {reveal: room});
				case 'flee':
					return api.answer(match, {to: room});
				default:
					return Promise.resolve();
			}
		},

		endTurn(match) {
			return run('End the turn', async () => {
				sending('End the turn');
				return sendAsSigner('End the turn', (p) => ({
					...contract(),
					functionName: 'endTurn',
					args: [match.id, p],
				}));
			});
		},

		claimTimeout(match) {
			return run('Claim the timeout', async () => {
				sending('Claim the timeout');
				return sendAsSigner('Claim the timeout', () => ({
					...contract(),
					functionName: 'claimTimeout',
					args: [match.id],
				}));
			});
		},

		cancel(match) {
			return run('Cancel the match', async () => {
				sending('Cancel the match');
				return sendFromAccount((p) => ({
					...contract(),
					functionName: 'cancelMatch',
					args: [match.id, p],
				}));
			});
		},

		withdraw() {
			return run('Withdraw', async () => {
				sending('Withdraw');
				return sendFromAccount(() => ({
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
	return api;
}
