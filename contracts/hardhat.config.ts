import {loadEnv} from 'ldenv';
loadEnv();
import '@nomicfoundation/hardhat-network-helpers';
import 'solidity-coverage';
import {addForkConfiguration, addNetworksFromEnv} from 'hardhat-rocketh';
import '@nomiclabs/hardhat-ethers';
import "@nomicfoundation/hardhat-chai-matchers";
import "@typechain/hardhat";

export default {
	solidity: '0.8.20',
	networks: addForkConfiguration(
		addNetworksFromEnv({
			hardhat: {
				initialBaseFeePerGas: 0,
				mining: {
					interval: process.env['BLOCK_TIME'] ? parseInt(process.env['BLOCK_TIME']) : undefined,
				},
			},
		})
	),
	paths: {
		sources: 'src',
	},
};
