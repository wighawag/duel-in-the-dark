import type {TypedDeployments} from '$lib/deployments-store.js';
import type {CoreServices} from '$lib/context/core.js';
import type {SignerGrant} from '$lib/ui/delegation/grant.js';
import {createGameState, type GameStateStore} from './state.js';

/**
 * THIS APP'S HALF OF THE CONTEXT: the game's, reached through the
 * `$app-specific` alias (svelte.config.js) instead of jolly-roger's greetings
 * demo (`context/app.ts`, deliberately not carried: see .offshoot-omissions).
 *
 * The alias contract is what jolly-roger's file exported: `createAppContext`,
 * `AppMembers`, `SIGNER_GRANT`, `operationScope` and `delegationRegistry`.
 * A game built on this template replaces this file the same way.
 */

/**
 * WHAT THIS APP'S BROWSER KEY IS FOR, in the sentences of ui/delegation/grant.ts
 * ("so the app can play your turns without asking you to sign every time").
 * Accurate on purpose: stakes and withdrawals still go through the wallet, see
 * $lib/zk-game/send.ts.
 */
/**
 * THE GAME'S NAME AND PAGE, for the inherited chrome that links to it (the
 * navbar, the home page), so a descendant renames its game here and edits no
 * shared file. The e2e suites have the same pair in web/e2e/routes.ts.
 */
export const GAME = {name: 'Hide and Seek', route: '/hide-and-seek/'} as const;

export const SIGNER_GRANT: SignerGrant = {action: 'play your turns'};

export function createAppContext(core: CoreServices): AppMembers {
	const onchainState = createGameState({
		publicClient: core.publicClient,
		deployments: core.deployments,
		account: core.account,
		...(core.chainFetchGate ? {fetchGate: core.chainFetchGate} : {}),
	});
	return {onchainState};
}

export type AppMembers = {
	onchainState: GameStateStore;
};

/**
 * Which contract a browser's operation records belong to. The game's proxy:
 * stable for the deployment, unlike its implementation.
 */
export function operationScope(deployments: TypedDeployments): `0x${string}` {
	return deployments.contracts.HideAndSeek.address;
}

/**
 * Where this browser's signer is authorised to act for the player: the game
 * contract, which is the one that adopted `UsingDelegation` (via ZKMatches).
 * An authorisation is only good at the contract it was given to, so this must
 * be the contract the turns are sent to.
 */
export function delegationRegistry(
	deployments: TypedDeployments,
): `0x${string}` {
	return deployments.contracts.HideAndSeek.address;
}
