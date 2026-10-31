import {deployScript, artifacts} from '../rocketh/deploy.js';

// duel-in-the-dark's game contract (src/Duel), wired to its six verifiers.

/** How long a player has to act on their turn, in seconds. */
const TURN_DURATION = 10 * 60;
/** How long a player has to answer a query, in seconds. */
const RESPONSE_DURATION = 5 * 60;

export default deployScript(
	async (env) => {
		const {deployer, admin} = env.namedAccounts;

		await env.deployViaProxy(
			'Duel',
			{
				account: deployer,
				artifact: artifacts.Duel,
				args: [
					env.get('DuelStartVerifier').address,
					env.get('DuelMoveVerifier').address,
					env.get('DuelShootVerifier').address,
					env.get('DuelTrapVerifier').address,
					env.get('DuelEffectVerifier').address,
					env.get('DuelAnswerVerifier').address,
					BigInt(TURN_DURATION),
					BigInt(RESPONSE_DURATION),
				],
			},
			{
				owner: admin,
				linkedData: {
					actionPoints: 2,
					lives: 2,
					turnDuration: TURN_DURATION,
					responseDuration: RESPONSE_DURATION,
				},
				deterministicImplementation: true,
			},
		);
	},
	{tags: ['Duel', 'Duel_deploy'], dependencies: ['Verifiers']},
);
