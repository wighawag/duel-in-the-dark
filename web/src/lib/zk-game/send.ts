import {get} from 'svelte/store';
import type {Context} from '$lib/context/types';
import {
	InsufficientFundsError,
	isStoppedWaitingError,
	isUserRejectionError,
} from '$lib/core/transaction';
import {
	txErrorDetails,
	txErrorSummary,
} from '$lib/core/transaction/tx-error-summary';
import {connectionRefusal, isUserDecision} from '$lib/core/connection/refusal';
import {NotRegisteredError} from '$lib/ui/delegation/delegation-check';
import type {Abi, ContractFunctionParameters} from 'viem';

/**
 * Sending, for any call of a match game built on ZKMatches. Shared by every
 * game's client (routes/hide-and-seek/lib/game.ts is the worked example). Two senders, chosen per action and never mixed:
 *
 * - FROM THE ACCOUNT (wallet prompt) for what moves the player's money: a
 *   stake into `createMatch` / `joinMatch`, and `withdraw`. The account is the
 *   player, so no delegation is involved.
 * - FROM THE SIGNER (silent) for everything a turn is made of. The signer acts
 *   for the account, which the delegation check makes sure of before sending.
 *
 * Outcomes are normalised so a component only renders: decisions the user made
 * (rejecting, backing out) are `cancelled` and say nothing.
 */
export type SendResult =
	| {status: 'submitted'; hash: `0x${string}`}
	| {status: 'cancelled'}
	| {status: 'cannot-send'}
	| {status: 'error'; message: string; details: string};

export type SendDeps = Pick<
	Context,
	| 'connection'
	| 'accountExecutor'
	| 'signerExecutor'
	| 'accountBalance'
	| 'signerBalance'
	| 'balanceCheck'
	| 'delegationCheck'
>;

/**
 * A write to `TAbi`. The function NAME is checked (it must exist and not be a
 * view); the ARGUMENTS are only loosely checked, because the type is a union
 * over every function. The tests that send each call are what pin them down.
 * `value` for payable calls.
 */
export type WriteRequest<TAbi extends Abi> = ContractFunctionParameters<
	TAbi,
	'nonpayable' | 'payable'
> & {value?: bigint};

type ContractRequest = Extract<
	Parameters<Context['balanceCheck']['ensureCanAfford']>[0],
	{contract: unknown}
>['contract'];

/** The connected account, i.e. the player every action is for. */
export async function currentPlayer(
	deps: Pick<Context, 'connection'>,
): Promise<`0x${string}` | undefined> {
	await deps.connection.ensureConnected();
	const $connection = get(deps.connection);
	return 'account' in $connection ? $connection.account.address : undefined;
}

export async function sendFromAccount<TAbi extends Abi>(
	deps: SendDeps,
	build: (player: `0x${string}`) => WriteRequest<TAbi>,
): Promise<SendResult> {
	return send(async () => {
		const player = await currentPlayer(deps);
		if (!player) return {status: 'cancelled'};
		const executor = get(deps.accountExecutor);
		if (executor.status === 'cannot-send') return {status: 'cannot-send'};
		if (executor.status !== 'ready') return {status: 'cancelled'};
		const request = await deps.balanceCheck.ensureCanAfford(
			{
				contract: {
					...build(player),
					account: executor.account,
				} as unknown as ContractRequest,
			},
			{balance: deps.accountBalance, sender: executor.address},
		);
		return {
			status: 'submitted',
			hash: await executor.client.writeContract(request),
		};
	});
}

export async function sendAsSigner<TAbi extends Abi>(
	deps: SendDeps,
	action: string,
	build: (player: `0x${string}`) => WriteRequest<TAbi>,
): Promise<SendResult> {
	return send(async () => {
		const player = await currentPlayer(deps);
		if (!player) return {status: 'cancelled'};
		const executor = get(deps.signerExecutor);
		if (executor.status === 'cannot-send') return {status: 'cannot-send'};
		if (executor.status !== 'ready') return {status: 'cancelled'};
		// Asked before sending: a `NotDelegate` revert would cost a transaction to
		// learn what a read already knows. Blocks while the user authorises this
		// browser, then carries on with the same action.
		await deps.delegationCheck.ensureRegistered({
			signer: executor.address,
			resume: {action},
		});
		const request = await deps.balanceCheck.ensureCanAfford(
			{
				contract: {
					...build(player),
					account: executor.account,
				} as unknown as ContractRequest,
			},
			{balance: deps.signerBalance, sender: executor.address},
		);
		return {
			status: 'submitted',
			hash: await executor.client.writeContract(request),
		};
	});
}

async function send(run: () => Promise<SendResult>): Promise<SendResult> {
	try {
		return await run();
	} catch (error) {
		if (
			error instanceof InsufficientFundsError ||
			error instanceof NotRegisteredError ||
			isUserRejectionError(error) ||
			isStoppedWaitingError(error)
		) {
			return {status: 'cancelled'};
		}
		const refusal = connectionRefusal(error);
		if (refusal && isUserDecision(refusal)) return {status: 'cancelled'};
		console.error('zk-game: transaction failed', error);
		return {
			status: 'error',
			message: txErrorSummary(error),
			details: txErrorDetails(error),
		};
	}
}
