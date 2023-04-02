import { useEffect, useState } from 'react';
import { useAccount, useConnect } from 'wagmi';
import { InjectedConnector } from 'wagmi/connectors/injected';
import { usePrepareContractWrite, useContractWrite } from 'wagmi';
import styles from '@/styles/Home.module.scss';
import contracts from '../data/contracts';
import Ship from './Ship';
import Image from 'next/image';
import { createGame } from '@/utils/zk/contracts';
import { BigNumber } from 'ethers';
import { useNetwork, useSwitchNetwork, configureChains } from 'wagmi';
// import { hardhat } from '@wagmi/chains';
import { useContractRead } from 'wagmi';
import { join } from '../test';

export function Game() {
	if (typeof window !== 'undefined') {
		(window as any).join = join;
	}
	const { chain } = useNetwork();
	const [gameState, setGameState] = useState<'begin' | 'waiting' | 'during' | 'win' | 'lose'>(
		'begin'
	);
	const { address, isConnected } = useAccount();
	const { connect } = useConnect({ connector: new InjectedConnector() });
	const [createGameHash, setCreateGameHash] = useState<BigNumber>();
	const { config } = usePrepareContractWrite({
		address: contracts.Game.address,
		abi: contracts.Game.abi,
		args: [createGameHash as BigNumber],
		functionName: 'start',
		enabled: Boolean(createGameHash),
	});
	const { write } = useContractWrite(config);

	const { data, isError, isLoading } = useContractRead({
		address: contracts.Game.address,
		abi: contracts.Game.abi,
		functionName: 'turn',
		watch: true,
	});

	useEffect(() => {
		(async () => {
			const ret = await createGame(1);
			setCreateGameHash(ret.first_hash);
		})();
	}, []);

	const beginGame = async () => {
		if (address) {
			console.log(createGameHash);
			write?.();
			setGameState('during');
		} else alert('You need to be connected to begin a game');
	};

	if (gameState == 'begin') {
		return (
			<div
				className={styles.primaryButton}
				onClick={beginGame}
				style={{ color: `${address ? 'white' : 'gray'}` }}
			>
				BEGIN GAME
			</div>
		);
	} else if (gameState == 'waiting') {
		return (
			<div className={styles.waiting}>
				<h1>Waiting for the other player ...</h1>
				<h3>It shouldn't be long</h3>
				<div className={styles.imgContainer}>
					<div className={styles.blur}></div>
					<Image src="/duel-in-the-dark.png" alt="duel in the dark" fill={true} />
				</div>
			</div>
		);
	}

	console.log('DATA', data);
	return (
		<div>
			<div>{data?.toString()}</div>
			<div className={styles.primaryButton}>Play</div>
			<Ship />
		</div>
	);
}
