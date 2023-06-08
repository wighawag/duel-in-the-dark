import {execute} from 'rocketh';
import 'rocketh-deploy-proxy';
import {context} from './_context';

export default execute(
	context,
	async ({deployViaProxy, accounts, artifacts}) => {
		await deployViaProxy(
			'Game',
			{
				account: accounts.deployer,
				artifact: artifacts.Game,
			},
			{
				owner: accounts.deployer,
			}
		);
	},
	{tags: ['Game', 'Game_deploy']}
);
