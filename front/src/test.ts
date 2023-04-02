import { writeContract } from '@wagmi/core';
import { readContract } from '@wagmi/core';
import contracts from './data/contracts';
import { join_and_make_move } from './utils/zk/contracts';
export async function join() {
	const enemy_shot = await readContract({
		abi: contracts.Game.abi,
		address: contracts.Game.address,
		functionName: 'enemy_shot',
	});
	const data = await join_and_make_move(
		{
			move: 1,
			new_location: 0,
			previous_location: 1,
		},
		5
	);

	const tx = await writeContract({
		mode: 'recklesslyUnprepared',
		abi: contracts.Game.abi,
		address: contracts.Game.address,
		functionName: 'acceptAndMove',
		args: [
			data.previous_commit_hash,
			data.solProof as `0x{string}`,
			data.hit,
			data.new_commit_hash,
			data.shot,
		],
	});
	console.log({ tx });
	return tx;
}

if (typeof window !== 'undefined') {
	(window as any).join = join;
}
