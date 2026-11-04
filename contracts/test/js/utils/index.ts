import {Abi_InRangeVerifier} from '../../../generated/abis/InRangeVerifier.js';
import {Abi_HideAndSeek} from '../../../generated/abis/HideAndSeek.js';
import {
	artifacts,
	loadAndExecuteDeploymentsFromFiles,
} from '../../../rocketh/environment.js';
import {EthereumProvider} from 'hardhat/types/providers';

export function setupFixtures(provider: EthereumProvider) {
	const fixtures = {
		async deployAll() {
			const env = await loadAndExecuteDeploymentsFromFiles({
				provider: provider,
			});

			// Deployment are inherently untyped since they can vary from
			//  network or even be different from current artifacts so here
			//  we type them manually assuming the artifact is still matching
			const InRangeVerifier = env.get<Abi_InRangeVerifier>('InRangeVerifier');
			const HideAndSeek = env.get<Abi_HideAndSeek>('HideAndSeek');

			return {
				env,
				InRangeVerifier,
				HideAndSeek,
				namedAccounts: env.namedAccounts,
				unnamedAccounts: env.unnamedAccounts,
			};
		},

		/**
		 * Everything, plus a second HideAndSeek limited to `LIMITED_TURNS`
		 * turns (the app's deploys none), in place of the first.
		 */
		async deployLimited() {
			const all = await fixtures.deployAll();
			const {env} = all;
			const first = all.HideAndSeek;
			const read = (functionName: 'inRangeVerifier' | 'moveVerifier' | 'answerVerifier' | 'turnDuration' | 'responseDuration') =>
				env.read(first, {functionName});
			const HideAndSeek = (await env.deploy('LimitedHideAndSeek', {
				account: env.namedAccounts.deployer,
				artifact: artifacts.HideAndSeek,
				args: [
					await read('inRangeVerifier'),
					await read('moveVerifier'),
					await read('answerVerifier'),
					await read('turnDuration'),
					await read('responseDuration'),
					LIMITED_TURNS,
				],
			})) as unknown as typeof first;
			return {...all, HideAndSeek};
		},
	};
	return fixtures;
}

/** The turn limit of `deployLimited`'s HideAndSeek. */
export const LIMITED_TURNS = 4;
