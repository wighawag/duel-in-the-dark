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
		 * turns (the app's deploys none), in place of the first. Each read
		 * names its function literally, so it is typed by that function's
		 * output (one helper over a union of names typed them all as the
		 * union of an address and a number).
		 */
		async deployLimited() {
			const all = await fixtures.deployAll();
			const {env} = all;
			const first = all.HideAndSeek;
			const HideAndSeek = (await env.deploy('LimitedHideAndSeek', {
				account: env.namedAccounts.deployer,
				artifact: artifacts.HideAndSeek,
				args: [
					await env.read(first, {functionName: 'inRangeVerifier'}),
					await env.read(first, {functionName: 'moveVerifier'}),
					await env.read(first, {functionName: 'answerVerifier'}),
					await env.read(first, {functionName: 'turnDuration'}),
					await env.read(first, {functionName: 'responseDuration'}),
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
