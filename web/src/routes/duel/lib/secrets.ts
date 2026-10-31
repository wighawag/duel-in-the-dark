import type {DuelSecret} from 'duel-in-the-dark-circuits/duel';
import {
	createSecretStore as createStore,
	type SecretStore as Store,
} from '$lib/zk-game/secrets';

/** This game's secrets, in the shared store (see $lib/zk-game/secrets). */
export type SecretStore = Store<DuelSecret>;

export function createSecretStore(
	scope: {chainId: number; contract: string; player: string},
	storage?: Pick<Storage, 'getItem' | 'setItem'>,
): SecretStore {
	return createStore({namespace: 'duel', scope, isSecret}, storage);
}

export function isSecret(value: unknown): value is DuelSecret {
	const v = value as DuelSecret;
	return (
		typeof v === 'object' &&
		v !== null &&
		typeof v.room === 'number' &&
		Array.isArray(v.traps) &&
		v.traps.length === 2 &&
		v.traps.every((t) => typeof t === 'number') &&
		typeof v.charge === 'number' &&
		typeof v.salt === 'string' &&
		typeof v.commitment === 'string'
	);
}
