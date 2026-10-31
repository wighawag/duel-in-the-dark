import type {HideAndSeekSecret} from 'template-zk-game-circuits/hide-and-seek';
import {
	createSecretStore as createStore,
	type SecretStore as Store,
} from '$lib/zk-game/secrets';

/** This game's secrets, in the shared store (see $lib/zk-game/secrets). */
export type SecretStore = Store<HideAndSeekSecret>;

export function createSecretStore(
	scope: {chainId: number; contract: string; player: string},
	storage?: Pick<Storage, 'getItem' | 'setItem'>,
): SecretStore {
	return createStore({namespace: 'hide-and-seek', scope, isSecret}, storage);
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
