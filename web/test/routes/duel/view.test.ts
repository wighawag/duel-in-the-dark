import {describe, it, expect} from 'vitest';
import {
	pickModeFor,
	roleIn,
	shipView,
	statusLine,
} from '../../../src/routes/duel/lib/view';
import {isSecret} from '../../../src/routes/duel/lib/secrets';
import type {MatchSummary} from '$lib/duel/state';

const A = '0x00000000000000000000000000000000000000aa';
const B = '0x00000000000000000000000000000000000000bb';

function match(
	over: Partial<MatchSummary> = {},
	board: Partial<MatchSummary['board']> = {},
): MatchSummary {
	return {
		id: 1n,
		status: 'Active',
		turnSeat: 0,
		actionPoints: 2,
		awaiting: 0,
		winner: 0,
		deadline: 1000,
		stake: 1n,
		seats: [
			{player: A, commitment: '0x01'},
			{player: B, commitment: '0x02'},
		],
		...over,
		board: {
			commitments: ['0x01', '0x02'],
			hits: [0, 0],
			actor: 0,
			ap: 2,
			phase: 0,
			argA: 0,
			argB: 0,
			sealedRoom: 0,
			...board,
		},
	};
}

describe('roleIn', () => {
	it('gives the turn holder the turn, and the other nothing to do', () => {
		const m = match();
		expect(roleIn(m, A, 0)).toMatchObject({
			seat: 0,
			myTurn: true,
			mustAnswer: false,
		});
		expect(roleIn(m, B, 0)).toMatchObject({
			seat: 1,
			myTurn: false,
			mustAnswer: false,
		});
		expect(roleIn(m, A.toUpperCase().replace('0X', '0x'), 0).seat).toBe(0);
	});

	it('walks a shot: the target answers, then the shooter owes its free move', () => {
		const shot = match({awaiting: 2}, {phase: 1, ap: 0, argA: 4, argB: 7});
		expect(roleIn(shot, B, 0)).toMatchObject({
			mustAnswer: true,
			shot: {from: 4, into: 7, byMe: false},
		});
		expect(roleIn(shot, A, 0)).toMatchObject({
			waitingForAnswer: true,
			myTurn: false,
		});
		const after = match({}, {phase: 2, ap: 0, argA: 4, argB: 7, hits: [0, 1]});
		expect(roleIn(after, A, 0)).toMatchObject({
			mustMoveAfterShot: true,
			myTurn: false,
			theirHits: 1,
		});
		expect(roleIn(after, B, 0)).toMatchObject({myHits: 1, mustAnswer: false});
	});

	it('lets nobody act after the deadline, and says who won', () => {
		expect(roleIn(match(), A, 1001)).toMatchObject({
			timedOut: true,
			myTurn: false,
		});
		const done = match({status: 'Finished', winner: 1});
		expect(roleIn(done, B, 0).won).toBe(true);
		expect(roleIn(done, A, 0).lost).toBe(true);
	});

	it('offers an open match to anyone but its creator', () => {
		const open = match({status: 'Open'});
		expect(
			roleIn(open, '0x00000000000000000000000000000000000000cc', 0).canJoin,
		).toBe(true);
		expect(roleIn(open, A, 0)).toMatchObject({canJoin: false, canCancel: true});
	});
});

describe('the ship', () => {
	const kinds = (rooms: ReturnType<typeof shipView>) =>
		Object.fromEntries(rooms.map((r) => [r.room, r.kind]));
	const pickable = (rooms: ReturnType<typeof shipView>) =>
		rooms.filter((r) => r.pickable).map((r) => r.room);

	it('offers the adjacent rooms to move to', () => {
		const rooms = shipView({myRoom: 7, mode: 'move'});
		expect(pickable(rooms)).toEqual([4, 5, 6, 8]);
		expect(kinds(rooms)[7]).toBe('mine');
		expect(kinds(rooms)[1]).toBe('idle');
	});

	it('offers the rooms in sight to shoot, its own included', () => {
		expect(pickable(shipView({myRoom: 4, mode: 'shoot'}))).toEqual([
			2, 4, 5, 6, 7,
		]);
	});

	it('offers every room to start in, and marks the one picked', () => {
		const rooms = shipView({myRoom: undefined, mode: 'start', selected: 3});
		expect(pickable(rooms)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
		expect(rooms.find((r) => r.selected)?.room).toBe(3);
	});

	it("shows the opponent's revealed room and the room shot at", () => {
		const k = kinds(
			shipView({
				myRoom: 7,
				mode: 'none',
				shot: {from: 4, into: 7, byMe: false},
			}),
		);
		expect([k[4], k[7]]).toEqual(['revealed', 'mine']);
		const own = kinds(
			shipView({myRoom: 4, mode: 'none', shot: {from: 4, into: 6, byMe: true}}),
		);
		expect([own[4], own[6]]).toEqual(['mine', 'shotAt']);
	});

	it('picks by intent, and forces the move after a shot', () => {
		const m = match();
		expect(pickModeFor(m, roleIn(m, A, 0), 'shoot')).toBe('shoot');
		const one = match({}, {ap: 1});
		expect(pickModeFor(one, roleIn(one, A, 0), 'shoot')).toBe('none');
		expect(pickModeFor(one, roleIn(one, A, 0), 'move')).toBe('move');
		const after = match({}, {phase: 2, ap: 0, argA: 4});
		expect(pickModeFor(after, roleIn(after, A, 0), 'shoot')).toBe('move');
		expect(pickModeFor(m, roleIn(m, B, 0), 'move')).toBe('none');
	});

	it('says where things stand', () => {
		const shot = match({awaiting: 2}, {phase: 1, ap: 0, argA: 4, argB: 7});
		expect(statusLine(shot, roleIn(shot, B, 0))).toBe(
			'Shot from the Observation Gantry into the Cargo Hold: answer it.',
		);
		expect(statusLine(match(), roleIn(match(), A, 0))).toBe(
			'Your turn: 2 action points left.',
		);
	});
});

describe('secrets', () => {
	it('accepts a duel secret and nothing else', () => {
		const s = {room: 3, traps: [0, 0], charge: 0, salt: '1', commitment: '0x1'};
		expect(isSecret(s)).toBe(true);
		expect(isSecret({...s, traps: [0]})).toBe(false);
		expect(isSecret({cell: 3, salt: '1', commitment: '0x1'})).toBe(false);
	});
});
