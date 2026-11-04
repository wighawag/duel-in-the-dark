/**
 * Deploy this repo's contracts for a LAN box (github:wighawag/ethereum-lan-node)
 * WITHOUT the box: into a chain that exists only for this process, with the
 * box's chain id, so that the web app can be built with the addresses the box
 * will have. Run by nix/lan.nix at build time, where there is no network.
 *
 * It writes the `lan` deployment records (exported to the web app) and
 * `LAN_TRANSACTIONS` (default deployments/lan.transactions.json): every
 * transaction the deploy sent, which the box's deploy step replays
 * (nix/lan-deploy.sh) against its real chain.
 *
 * WHY THE ADDRESSES ARE THE BOX'S. Every contract is deployed through the
 * deterministic-deployment proxy at 0x4e59b448..., which the box's genesis
 * predeploys and which rocketh deploys here with the same pre-signed
 * transaction, so an address depends only on the salt and the init code: not
 * on the chain, its history, or a nonce. The script REFUSES any other kind of
 * transaction, because that is what would make the box diverge from the
 * build (a nonce-based deploy, a setup call whose effect is not in the init
 * code). The deployer and the admin are accounts 0 and 1 of the test
 * mnemonic, on the box as here.
 */
import {network} from 'hardhat';
import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {loadAndExecuteDeploymentsFromFiles} from '../rocketh/environment.js';

/** The box's chain id (ethereum-lan-node nix/genesis.json). */
const CHAIN_ID = Number(process.env.LAN_CHAIN_ID ?? 19216801);
const FACTORY = '0x4e59b44847b379578588920ca78fbf26c0b4956c';
/** The account that sends the factory's own pre-signed deployment. */
const FACTORY_DEPLOYER = '0x3fab184622dc19b6109349b94811493bf2a45362';
// Beside the records, not among them: rocketh reads every file in
// deployments/lan/ as a deployment.
const out = resolve(
	process.env.LAN_TRANSACTIONS ?? 'deployments/lan.transactions.json',
);

const connection = await network.connect({
	network: 'default',
	override: {
		chainId: CHAIN_ID,
		mining: {auto: true, interval: 0},
		gasPrice: 'auto',
	},
});
const provider = connection.provider;

const env = await loadAndExecuteDeploymentsFromFiles({
	provider,
	environment: 'lan',
	saveDeployments: true,
});
const accounts = [env.namedAccounts.deployer, env.namedAccounts.admin].map(
	(a) => a.toLowerCase(),
);

type Tx = {from: string; to: string | null; input: string; value: string};
const latest = Number(await provider.request({method: 'eth_blockNumber'}));
const transactions: {
	/** index of the sender in the test mnemonic */
	account: number;
	/** the address the init code lands at */
	address: string;
	data: string;
}[] = [];
for (let n = 1; n <= latest; n++) {
	const block = (await provider.request({
		method: 'eth_getBlockByNumber',
		params: [`0x${n.toString(16)}`, true],
	})) as {transactions: Tx[]};
	for (const tx of block.transactions) {
		const from = tx.from.toLowerCase();
		// The factory itself, and the ETH its pre-signed deployment needs: the
		// box's genesis predeploys it.
		if (from === FACTORY_DEPLOYER && tx.to === null) continue;
		if (tx.to?.toLowerCase() === FACTORY_DEPLOYER && tx.input === '0x')
			continue;
		const account = accounts.indexOf(from);
		if (
			account < 0 ||
			tx.to?.toLowerCase() !== FACTORY ||
			BigInt(tx.value) !== 0n
		) {
			throw new Error(
				`deploy-lan-build: block ${n} has a transaction a LAN box could not replay deterministically ` +
					`(from ${tx.from} to ${tx.to}): every contract must be deployed with \`deterministic: true\``,
			);
		}
		// What the factory deploys: CREATE2(salt = first 32 bytes, init code = the rest).
		const address = (await provider.request({
			method: 'eth_call',
			params: [
				{from: tx.from, to: tx.to, data: tx.input},
				`0x${(n - 1).toString(16)}`,
			],
		})) as string;
		transactions.push({
			account,
			address: `0x${address.slice(-40)}`,
			data: tx.input,
		});
	}
}
// Every deployment record must be one of the replayed addresses, or the web
// app would be built against a contract the box never gets.
const replayed = new Set(transactions.map((t) => t.address.toLowerCase()));
for (const [name, d] of Object.entries(env.deployments)) {
	if (!replayed.has(d.address.toLowerCase()))
		throw new Error(
			`deploy-lan-build: ${name} at ${d.address} was not deployed through the factory`,
		);
}
mkdirSync(dirname(out), {recursive: true});
writeFileSync(
	out,
	JSON.stringify(
		{chainId: CHAIN_ID, factory: FACTORY, transactions},
		null,
		'\t',
	) + '\n',
);
console.log(
	`deploy-lan-build: ${transactions.length} transactions for chain ${CHAIN_ID} in ${out}`,
);
for (const [name, d] of Object.entries(env.deployments))
	console.log(`  ${name} ${d.address}`);
