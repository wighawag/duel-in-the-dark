import deployVerifiers from 'duel-in-the-dark-contracts/deploy/000_deploy_verifiers.js';
import deployDuel from 'duel-in-the-dark-contracts/deploy/002_deploy_duel.js';

/**
 * WHAT AN EMBEDDED WORLD MUST DEPLOY for the app's context to work, and the
 * rocketh setup it deploys with, in ONE place, so a descendant that replaces
 * the app's contracts (its own contracts package, its own deploy scripts)
 * edits this file and not every suite that boots a world. Read by
 * `embedded/world.test.ts` and `embedded/deployments.test.ts`. Its e2e twin is
 * `MAIN_PAGE` of `web/e2e/routes.ts`, whose `contract` names the same contract.
 */
export {config, extensions} from 'duel-in-the-dark-contracts/rocketh/config.js';

/**
 * The deploy scripts a world runs, in order: the verifiers and the game, whose
 * contract the context reads (operationScope, delegationRegistry).
 */
export const APP_SCRIPTS = [
	{id: '000_deploy_verifiers', module: deployVerifiers},
	{id: '002_deploy_duel', module: deployDuel},
];

/** The deployment name of the contract the app's context reads. */
export const APP_CONTRACT = 'Duel' as const;
