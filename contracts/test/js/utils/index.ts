import {Abi_GreetingsRegistry} from '../../../generated/abis/GreetingsRegistry.js';
import {Abi_InRangeVerifier} from '../../../generated/abis/InRangeVerifier.js';
import {Abi_HideAndSeek} from '../../../generated/abis/HideAndSeek.js';
import {loadAndExecuteDeploymentsFromFiles} from '../../../rocketh/environment.js';
import {EthereumProvider} from 'hardhat/types/providers';

export function setupFixtures(provider: EthereumProvider) {
	return {
		async deployAll() {
			const env = await loadAndExecuteDeploymentsFromFiles({
				provider: provider,
			});

			// Deployment are inherently untyped since they can vary from
			//  network or even be different from current artifacts so here
			//  we type them manually assuming the artifact is still matching
			const GreetingsRegistry =
				env.get<Abi_GreetingsRegistry>('GreetingsRegistry');
			const InRangeVerifier = env.get<Abi_InRangeVerifier>('InRangeVerifier');
			const HideAndSeek = env.get<Abi_HideAndSeek>('HideAndSeek');

			return {
				env,
				GreetingsRegistry,
				InRangeVerifier,
				HideAndSeek,
				namedAccounts: env.namedAccounts,
				unnamedAccounts: env.unnamedAccounts,
			};
		},
	};
}
