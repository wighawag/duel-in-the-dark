/**
 * Where a player's hidden state lives: this browser, and nowhere else. Shared
 * by every match game; each game names its own `namespace` and its own secret
 * shape (anything with the `commitment` it opens).
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
 * next deadline ends it. Hence `exportAll` / `importAll`, which a game page
 * offers as a backup. Importing keeps only entries `isSecret` accepts.
 */
export type SecretStore<T extends {commitment: string}> = {
	put(secret: T): void;
	get(commitment: string): T | undefined;
	exportAll(): string;
	importAll(json: string): number;
};

export function createSecretStore<T extends {commitment: string}>(
	options: {
		/** the game's own prefix, so two games never read each other's secrets */
		namespace: string;
		scope: {chainId: number; contract: string; player: string};
		isSecret(value: unknown): value is T;
	},
	storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): SecretStore<T> {
	const {namespace, scope, isSecret} = options;
	const key = `${namespace}:${scope.chainId}:${scope.contract.toLowerCase()}:${scope.player.toLowerCase()}`;

	function read(): Record<string, T> {
		try {
			return JSON.parse(storage.getItem(key) ?? '{}');
		} catch {
			return {};
		}
	}
	function write(all: Record<string, T>) {
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
			const incoming = JSON.parse(json) as Record<string, unknown>;
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
