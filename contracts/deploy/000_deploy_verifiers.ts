import {deployScript, artifacts} from '../rocketh/deploy.js';
import {circuits} from 'template-zk-game-circuits/circuits';

// One verifier per circuit, all linked to ONE deployment of the libraries in
// src/verifiers/HonkVerifierBase.sol (circuits/scripts/generate.ts explains why
// they are shared). Everything here is deterministic and stateless, so a
// redeploy only happens when a circuit, and therefore its verification key,
// actually changed. A game reads the address of `<Name>Verifier`.

export default deployScript(
	async (env) => {
		const {deployer} = env.namedAccounts;

		const RelationsLib = await env.deploy(
			'RelationsLib',
			{
				account: deployer,
				artifact: artifacts.RelationsLib,
			},
			{deterministic: true},
		);
		const ZKTranscriptLib = await env.deploy(
			'ZKTranscriptLib',
			{
				account: deployer,
				artifact: artifacts.ZKTranscriptLib,
			},
			{deterministic: true},
		);
		const libraries = {
			RelationsLib: RelationsLib.address,
			ZKTranscriptLib: ZKTranscriptLib.address,
		};

		for (const name of Object.keys(circuits)) {
			const contractName = `${pascal(name)}Verifier`;
			const artifact = (artifacts as Record<string, unknown>)[contractName];
			if (!artifact) {
				throw new Error(
					`no artifact for ${contractName}: run \`pnpm --filter ./circuits generate\` then compile`,
				);
			}
			await env.deploy(
				contractName,
				{
					account: deployer,
					artifact: artifact as typeof artifacts.InRangeVerifier,
				},
				{deterministic: true, libraries},
			);
		}
	},
	{tags: ['Verifiers', 'Verifiers_deploy']},
);

function pascal(snake: string): string {
	return snake
		.split(/[_-]/)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('');
}
