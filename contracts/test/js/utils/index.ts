import {Abi_InRangeVerifier} from '../../../generated/abis/InRangeVerifier.js';
import {Abi_DuelShootVerifier} from '../../../generated/abis/DuelShootVerifier.js';
import {Abi_Duel} from '../../../generated/abis/Duel.js';
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
			const InRangeVerifier = env.get<Abi_InRangeVerifier>('InRangeVerifier');
			const DuelShootVerifier =
				env.get<Abi_DuelShootVerifier>('DuelShootVerifier');
			const Duel = env.get<Abi_Duel>('Duel');

			return {
				env,
				InRangeVerifier,
				Duel,
				DuelShootVerifier,
				namedAccounts: env.namedAccounts,
				unnamedAccounts: env.unnamedAccounts,
			};
		},
	};
}
