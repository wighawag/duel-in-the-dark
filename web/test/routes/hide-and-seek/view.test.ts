import {describe, it, expect} from 'vitest';
import {roleIn} from '../../../src/routes/hide-and-seek/lib/view';
import {createSecretStore} from '../../../src/routes/hide-and-seek/lib/secrets';
import type {MatchSummary} from '../../../src/routes/hide-and-seek/lib/game';

const A = '0x00000000000000000000000000000000000000aa' as const;
const B = '0x00000000000000000000000000000000000000bb' as const;
const C = '0x00000000000000000000000000000000000000cc' as const;
const ZERO = '0x0000000000000000000000000000000000000000' as const;

function match(overrides: Partial<MatchSummary>): MatchSummary {
	return {
		id: 1n,
		status: 'Active',
		turnSeat: 0,
		actionPoints: 2,
		awaiting: 0,
		winner: 0,
		deadline: 1000,
		stake: 10n,
		seats: [
			{player: A, commitment: '0x01'},
			{player: B, commitment: '0x02'},
		],
		pendingGuess: 0,
		...overrides,
	};
}

describe('roleIn', () => {
	it('knows whose turn it is', () => {
		expect(roleIn(match({}), A, 0).myTurn).toBe(true);
		expect(roleIn(match({}), B, 0).myTurn).toBe(false);
	});

	it('makes the queried player answer, and the asker wait', () => {
		const m = match({awaiting: 1 << 1});
		expect(roleIn(m, B, 0).mustAnswer).toBe(true);
		expect(roleIn(m, A, 0).myTurn).toBe(false);
		expect(roleIn(m, A, 0).waitingForAnswer).toBe(true);
	});

	it('lets nobody act once the deadline has passed, only claim', () => {
		const role = roleIn(match({}), A, 1001);
		expect([role.myTurn, role.timedOut, role.secondsLeft]).toEqual([
			false,
			true,
			0,
		]);
	});

	it('offers an open match to anyone but its creator, who may cancel', () => {
		const open = match({
			status: 'Open',
			seats: [
				{player: A, commitment: '0x01'},
				{player: ZERO, commitment: '0x00'},
			],
		});
		expect(roleIn(open, C, 0).canJoin).toBe(true);
		expect(roleIn(open, A, 0).canJoin).toBe(false);
		expect(roleIn(open, A, 0).canCancel).toBe(true);
		expect(roleIn(open, undefined, 0).canJoin).toBe(false);
	});

	it('tells the winner from the loser', () => {
		const done = match({status: 'Finished', winner: 1});
		expect(roleIn(done, B, 0).won).toBe(true);
		expect(roleIn(done, A, 0).lost).toBe(true);
		expect(roleIn(done, C, 0).lost).toBe(false);
	});
});

describe('secret store', () => {
	function memory() {
		const map = new Map<string, string>();
		return {
			getItem: (k: string) => map.get(k) ?? null,
			setItem: (k: string, v: string) => void map.set(k, v),
		};
	}
	const scope = {chainId: 1, contract: '0xC0', player: A};
	const secret = {cell: 3, salt: '42', commitment: '0xAbC' as const};

	it('finds a secret by the commitment it opens, whatever its case', () => {
		const store = createSecretStore(scope, memory());
		store.put(secret);
		expect(store.get('0xabc')).toEqual(secret);
	});

	it('keeps players, chains and contracts apart', () => {
		const storage = memory();
		createSecretStore(scope, storage).put(secret);
		expect(createSecretStore({...scope, player: B}, storage).get('0xabc')).toBe(
			undefined,
		);
		expect(
			createSecretStore({...scope, chainId: 2}, storage).get('0xabc'),
		).toBe(undefined);
	});

	it('restores a backup into another browser, ignoring junk', () => {
		const source = createSecretStore(scope, memory());
		source.put(secret);
		const target = createSecretStore(scope, memory());
		const json = JSON.stringify({
			...JSON.parse(source.exportAll()),
			'0xdead': {nope: true},
		});
		expect(target.importAll(json)).toBe(1);
		expect(target.get('0xabc')).toEqual(secret);
	});
});
