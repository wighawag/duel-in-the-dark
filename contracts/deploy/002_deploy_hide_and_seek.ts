import {deployScript, artifacts} from '../rocketh/deploy.js';

// The template's reference game (src/HideAndSeek). A descendant replaces this
// script with its own game's, wired to its own verifiers the same way.

/** How long a player has to act on their turn, in seconds. */
const TURN_DURATION = 10 * 60;
/** How long a player has to answer a query, in seconds. */
const RESPONSE_DURATION = 5 * 60;

export default deployScript(
	async (env) => {
		const {deployer, admin} = env.namedAccounts;

		const verifiers = {
			inRange: env.get('InRangeVerifier').address,
			move: env.get('MoveOnRingVerifier').address,
			answer: env.get('AnswerGuessVerifier').address,
		};

		await env.deployViaProxy(
			'HideAndSeek',
			{
				account: deployer,
				artifact: artifacts.HideAndSeek,
				args: [
					verifiers.inRange,
					verifiers.move,
					verifiers.answer,
					BigInt(TURN_DURATION),
					BigInt(RESPONSE_DURATION),
				],
			},
			{
				owner: admin,
				linkedData: {
					cells: 8,
					actionPoints: 2,
					turnDuration: TURN_DURATION,
					responseDuration: RESPONSE_DURATION,
				},
				deterministicImplementation: true,
			},
		);
	},
	{tags: ['HideAndSeek', 'HideAndSeek_deploy'], dependencies: ['Verifiers']},
);
