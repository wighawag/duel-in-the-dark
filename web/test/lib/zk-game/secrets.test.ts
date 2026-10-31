import {describe, it, expect} from 'vitest';
import {createSecretStore} from '$lib/zk-game/secrets';

type Secret = {room: number; commitment: string};
const isSecret = (v: unknown): v is Secret =>
	typeof v === 'object' &&
	v !== null &&
	typeof (v as Secret).room === 'number' &&
	typeof (v as Secret).commitment === 'string';

function memory() {
	const map = new Map<string, string>();
	return {
		getItem: (k: string) => map.get(k) ?? null,
		setItem: (k: string, v: string) => void map.set(k, v),
	};
}
const scope = {chainId: 1, contract: '0xAbC', player: '0xDeF'};

describe('the shared secret store', () => {
	it('finds a secret by the commitment it opens, in any case', () => {
		const store = createSecretStore(
			{namespace: 'g', scope, isSecret},
			memory(),
		);
		store.put({room: 3, commitment: '0xAA'});
		expect(store.get('0xaa')).toEqual({room: 3, commitment: '0xAA'});
		expect(store.get('0xbb')).toBeUndefined();
	});

	it('keeps games, players and contracts apart', () => {
		const storage = memory();
		createSecretStore({namespace: 'a', scope, isSecret}, storage).put({
			room: 1,
			commitment: '0x1',
		});
		expect(
			createSecretStore({namespace: 'b', scope, isSecret}, storage).get('0x1'),
		).toBeUndefined();
		expect(
			createSecretStore(
				{namespace: 'a', scope: {...scope, player: '0x9'}, isSecret},
				storage,
			).get('0x1'),
		).toBeUndefined();
	});

	it('restores a backup, keeping only what is a secret', () => {
		const from = createSecretStore({namespace: 'g', scope, isSecret}, memory());
		from.put({room: 1, commitment: '0x1'});
		const json = JSON.stringify({
			...JSON.parse(from.exportAll()),
			'0x2': {junk: true},
		});
		const to = createSecretStore({namespace: 'g', scope, isSecret}, memory());
		expect(to.importAll(json)).toBe(1);
		expect(to.get('0x1')).toEqual({room: 1, commitment: '0x1'});
		expect(to.get('0x2')).toBeUndefined();
	});
});
