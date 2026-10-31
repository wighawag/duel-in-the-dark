import deployVerifiers from 'duel-in-the-dark-contracts/deploy/000_deploy_verifiers.js';
import deployDuel from 'duel-in-the-dark-contracts/deploy/002_deploy_duel.js';

/**
 * What an embedded world must deploy for the app's context to work: the
 * verifiers and the game, whose contract the context reads (operationScope,
 * delegationRegistry). In ONE place so a descendant that replaces the game
 * edits this file, not every suite that boots a world.
 */
export const GAME_SCRIPTS = [
	{id: '000_deploy_verifiers', module: deployVerifiers},
	{id: '002_deploy_duel', module: deployDuel},
];

/** The game's deployment name. */
export const GAME_CONTRACT = 'Duel' as const;
