import type {HideAndSeekSecret} from 'template-zk-game-circuits/hide-and-seek';

/**
 * Where a player's hidden state lives: this browser, and nowhere else.
 *
 * KEYED BY COMMITMENT, NOT BY MATCH OR BY TIME. Every secret is stored under the
 * commitment it opens, BEFORE the transaction that publishes that commitment is
 * sent. The current secret of a seat is then simply the one whose commitment the
 * chain holds for it. That makes the store correct without tracking
 * confirmations: a transaction that failed or was replaced leaves an unused
 * entry behind, never a wrong current secret. It also works for `createMatch`,
 * whose match id is unknown until it is mined.
 *
 * LOSING THIS LOSES THE MATCH: without the secret nothing can be proven, and the
 * next deadline ends it. Hence `exportAll` / `importAll`, which the page offers
 * as a backup.
 */
export type SecretStore = {
	put(secret: HideAndSeekSecret): void;
	get(commitment: string): HideAndSeekSecret | undefined;
	exportAll(): string;
	importAll(json: string): number;
};

export function createSecretStore(
	scope: {chainId: number; contract: string; player: string},
	storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): SecretStore {
	const key = `hide-and-seek:${scope.chainId}:${scope.contract.toLowerCase()}:${scope.player.toLowerCase()}`;

	function read(): Record<string, HideAndSeekSecret> {
		try {
			return JSON.parse(storage.getItem(key) ?? '{}');
		} catch {
			return {};
		}
	}
	function write(all: Record<string, HideAndSeekSecret>) {
		storage.setItem(key, JSON.stringify(all));
	}

	return {
		put(secret) {
			const all = read();
			all[secret.commitment.toLowerCase()] = secret;
			write(all);
		},
		get(commitment) {
			return read()[commitment.toLowerCase()];
		},
		exportAll() {
			return JSON.stringify(read());
		},
		importAll(json) {
			const incoming = JSON.parse(json) as Record<string, HideAndSeekSecret>;
			const all = read();
			let added = 0;
			for (const [commitment, secret] of Object.entries(incoming)) {
				if (!isSecret(secret)) continue;
				if (!all[commitment.toLowerCase()]) added++;
				all[commitment.toLowerCase()] = secret;
			}
			write(all);
			return added;
		},
	};
}

function isSecret(value: unknown): value is HideAndSeekSecret {
	const v = value as HideAndSeekSecret;
	return (
		typeof v === 'object' &&
		v !== null &&
		typeof v.cell === 'number' &&
		typeof v.salt === 'string' &&
		typeof v.commitment === 'string'
	);
}
