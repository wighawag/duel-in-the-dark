import type {TypedDeployments} from '$lib/deployments-store.js';
import type {CoreServices} from '$lib/context/core.js';
import type {SignerGrant} from '$lib/ui/delegation/grant.js';
import {createDuelState, type DuelStateStore} from './state.js';

/**
 * THIS APP'S HALF OF THE CONTEXT: duel-in-the-dark's, reached through the
 * `$app-specific` alias (svelte.config.js) in place of template-zk-game's
 * reference game (`lib/game/`, deliberately not carried: see
 * .offshoot-omissions). It exports what that module exported.
 */

/** The game's name and page, for the inherited navbar and home page. */
export const GAME = {name: 'Duel in the Dark', route: '/duel/'} as const;

/**
 * WHAT THIS APP'S BROWSER KEY IS FOR, in the sentences of ui/delegation/grant.ts.
 * Stakes and withdrawals still go through the wallet, see $lib/zk-game/send.ts.
 */
export const SIGNER_GRANT: SignerGrant = {action: 'play your turns'};

export function createAppContext(core: CoreServices): AppMembers {
	const onchainState = createDuelState({
		publicClient: core.publicClient,
		deployments: core.deployments,
		account: core.account,
		...(core.chainFetchGate ? {fetchGate: core.chainFetchGate} : {}),
	});
	return {onchainState};
}

export type AppMembers = {
	onchainState: DuelStateStore;
};

/** Which contract a browser's operation records belong to: the game's proxy. */
export function operationScope(deployments: TypedDeployments): `0x${string}` {
	return deployments.contracts.Duel.address;
}

/**
 * Where this browser's signer is authorised to act for the player: the game
 * contract, which adopted `UsingDelegation` (via ZKMatches).
 */
export function delegationRegistry(
	deployments: TypedDeployments,
): `0x${string}` {
	return deployments.contracts.Duel.address;
}
