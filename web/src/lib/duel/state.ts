import {derived, readable, type Readable} from 'svelte/store';
import type {PublicClient} from 'viem';
import type {TypedDeployments} from '$lib/deployments-store';
import type {Account} from '$lib/core/connection/types';
import {
	createPollingStore,
	type PollingStore,
} from '$lib/core/connection/polling-store';

/**
 * The game's onchain state, the app context's `onchainState`: the latest
 * matches, each with the public duel `State` the circuits see (`getState`),
 * plus the connected player's withdrawable balance. Polled; refetched at once
 * when the account changes.
 */

export const STATUS = [
	'None',
	'Open',
	'Active',
	'Finished',
	'Cancelled',
] as const;
export type MatchStatus = (typeof STATUS)[number];

/** How many of the latest matches are read. */
const RECENT = 20;

/** The public duel state, as the circuits and `Duel.getState` have it. */
export type BoardState = {
	commitments: readonly [`0x${string}`, `0x${string}`];
	hits: readonly [number, number];
	actor: number;
	ap: number;
	phase: number;
	argA: number;
	argB: number;
	sealedRoom: number;
};

export type MatchSummary = {
	id: bigint;
	status: MatchStatus;
	turnSeat: number;
	actionPoints: number;
	awaiting: number;
	winner: number;
	deadline: number;
	stake: bigint;
	seats: readonly {player: `0x${string}`; commitment: `0x${string}`}[];
	board: BoardState;
};

export type GameView = {
	player?: `0x${string}`;
	balance: bigint;
	matches: MatchSummary[];
};

export type DuelStateStore = PollingStore<GameView>;

export function createDuelState(params: {
	publicClient: PublicClient;
	deployments: Readable<TypedDeployments> & {get(): TypedDeployments};
	account: Readable<Account>;
	/** When present, nothing is read while it is false (no RPC of our own yet). */
	fetchGate?: Readable<boolean>;
	fetchInterval?: number;
}): DuelStateStore {
	const {publicClient, deployments} = params;
	const source = derived(
		[params.fetchGate ?? readable(true), params.account],
		([$gate, $account]) => ($gate ? {account: $account} : undefined),
	);

	return createPollingStore<GameView, {account: Account} | undefined>(
		async (current) => {
			const c = deployments.get().contracts.Duel;
			const player = current?.account;
			const last = await publicClient.readContract({
				...c,
				functionName: 'lastMatchId',
			});
			const ids: bigint[] = [];
			for (let id = last; id > 0n && ids.length < RECENT; id--) ids.push(id);
			const matches = await Promise.all(
				ids.map(async (id) => {
					const [m, s] = await Promise.all([
						publicClient.readContract({
							...c,
							functionName: 'getMatch',
							args: [id],
						}),
						publicClient.readContract({
							...c,
							functionName: 'getState',
							args: [id],
						}),
					]);
					return {
						id,
						status: STATUS[m.state.status] ?? 'None',
						turnSeat: m.state.turnSeat,
						actionPoints: m.state.actionPoints,
						awaiting: m.state.awaiting,
						winner: m.state.winner,
						deadline: Number(m.state.deadline),
						stake: m.state.stake,
						seats: m.seats,
						board: {
							...s,
							commitments: [s.commitments[0], s.commitments[1]],
							hits: [s.hits[0], s.hits[1]],
						},
					} satisfies MatchSummary;
				}),
			);
			const balance = player
				? await publicClient.readContract({
						...c,
						functionName: 'balanceOf',
						args: [player],
					})
				: 0n;
			return {player, balance, matches};
		},
		{
			fetchInterval: params.fetchInterval ?? 3_000,
			source: {
				store: source,
				key: (v) => (v ? `on:${v.account ?? ''}` : undefined),
			},
		},
	);
}
