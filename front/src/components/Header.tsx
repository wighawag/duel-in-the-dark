import styles from '@/styles/Home.module.scss';
import { useAccount, useConnect } from 'wagmi';
import { InjectedConnector } from 'wagmi/connectors/injected';

export function Header() {
	const { address, isConnected } = useAccount();
	const { connect } = useConnect({ connector: new InjectedConnector() });

	return (
		<div className={styles.header}>
			{address ? (
				<div>{`${address?.slice(0, 5)}...${address?.slice(
					address.length - 3,
					address?.length
				)}`}</div>
			) : (
				<div className={styles.primaryButton} onClick={() => connect()}>
					Connect wallet
				</div>
			)}
		</div>
	);
}
