import {describe, it, expect} from 'vitest';
import {ACTION, PHASE, type Hidden} from 'duel-in-the-dark-circuits/duel';
import {
	actionsFor,
	gearLine,
	pickModeFor,
	queryOf,
	resultLine,
	roleIn,
	sealedNow,
	shipView,
	statusLine,
	turnLine,
	NO_WINNER,
} from '../../../src/routes/duel/lib/view';
import {
	describe as describeEntry,
	historyOf,
	sightingLine,
	sightingOf,
	type ActedEvent,
} from '../../../src/routes/duel/lib/history';
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
		maxTurns: 30,
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
			phase: PHASE.PLAY,
			argA: 0,
			argB: 0,
			sealedRoom: 0,
			turn: 1,
			acted: 0,
			sealedTurn: 0,
			tracked: 0,
			armed: 0,
			last: 0,
			...board,
		},
	};
}

const at = (
	room: number,
	traps: [number, number] = [0, 0],
	charge = 0,
): Hidden => ({
	room,
	traps,
	charge,
});

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
		const shot = match(
			{awaiting: 2},
			{phase: PHASE.SHOT, ap: 0, argA: 4, argB: 7},
		);
		expect(roleIn(shot, B, 0)).toMatchObject({
			mustAnswer: true,
			shot: {from: 4, into: 7, byMe: false},
		});
		expect(roleIn(shot, A, 0)).toMatchObject({
			waitingForAnswer: true,
			myTurn: false,
		});
		const after = match(
			{},
			{phase: PHASE.MOVE_AFTER_SHOT, ap: 0, argA: 4, argB: 7, hits: [0, 1]},
		);
		expect(roleIn(after, A, 0)).toMatchObject({
			mustMoveAfterShot: true,
			myTurn: false,
			theirHits: 1,
		});
		expect(roleIn(after, B, 0)).toMatchObject({myHits: 1, mustAnswer: false});
	});

	it("makes every query the other player's to answer", () => {
		for (const phase of [
			PHASE.LISTEN,
			PHASE.DETONATION,
			PHASE.CHARGE,
			PHASE.PURGE,
			PHASE.CHUTE,
			PHASE.TRACKER,
		]) {
			const m = match({awaiting: 2}, {phase});
			expect([
				roleIn(m, B, 0).mustAnswer,
				roleIn(m, A, 0).waitingForAnswer,
			]).toEqual([true, true]);
		}
	});

	it('holds a turn whose Remote Charge is due to setting it off', () => {
		const due = match({}, {armed: 1, turn: 3, acted: 1});
		expect(roleIn(due, A, 0)).toMatchObject({
			mustFireCharge: true,
			myTurn: false,
		});
		const theirs = match({}, {armed: 2, turn: 3, acted: 1});
		expect(roleIn(theirs, A, 0)).toMatchObject({
			mustFireCharge: false,
			myTurn: true,
		});
		const sameTurn = match({}, {armed: 1, turn: 3, acted: 3});
		expect(roleIn(sameTurn, A, 0).mustFireCharge).toBe(false);
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

describe('the actions offered', () => {
	const offered = (m: MatchSummary, me: Hidden) =>
		Object.entries(actionsFor(m, roleIn(m, A, 0), me))
			.filter(([, v]) => v)
			.map(([k]) => k);

	it('offers each room its own effect, and the rest by action points', () => {
		const m = match();
		const common = ['move', 'shoot', 'listen', 'setTrap'];
		expect(offered(m, at(1))).toEqual([...common, 'coolantPurge']);
		expect(offered(m, at(3))).toEqual([...common, 'maintenanceChute']);
		expect(offered(m, at(4))).toEqual([...common, 'dropDown']);
		expect(offered(m, at(5))).toEqual([...common, 'stimRations']);
		expect(offered(m, at(7))).toEqual([...common, 'motionTracker']);
		expect(offered(m, at(8))).toEqual([...common, 'remoteCharge']);
		expect(offered(m, at(2))).toEqual(common);
	});

	it('limits Stim Rations to the start of the turn and the tracker to once a turn', () => {
		expect(offered(match({}, {acted: 1, ap: 1}), at(5))).not.toContain(
			'stimRations',
		);
		expect(offered(match({}, {tracked: 1}), at(7))).not.toContain(
			'motionTracker',
		);
		expect(offered(match({}, {tracked: 1, turn: 3}), at(7))).toContain(
			'motionTracker',
		);
	});

	it('handles traps: none twice in a room, a third replaces, detonate any', () => {
		expect(offered(match(), at(2, [2, 0]))).not.toContain('setTrap');
		expect(offered(match(), at(2, [5, 0]))).toEqual(
			expect.arrayContaining(['setTrap', 'detonate']),
		);
		expect(offered(match(), at(2, [5, 6]))).toContain('setTrapReplaces');
		expect(offered(match(), at(8, [0, 0], 3))).not.toContain('remoteCharge');
	});

	it('offers nothing out of turn, or without points', () => {
		expect(actionsFor(match(), roleIn(match(), B, 0), at(1)).move).toBe(false);
		expect(offered(match({}, {ap: 0}), at(4))).toEqual(['dropDown']);
	});
});

describe('the ship', () => {
	const kinds = (rooms: ReturnType<typeof shipView>) =>
		Object.fromEntries(rooms.map((r) => [r.room, r.kind]));
	const pickable = (rooms: ReturnType<typeof shipView>) =>
		rooms.filter((r) => r.pickable).map((r) => r.room);

	it('offers the adjacent rooms to move to, but not a sealed one', () => {
		const rooms = shipView({match: match(), me: at(7), mode: 'move'});
		expect(pickable(rooms)).toEqual([4, 5, 6, 8]);
		expect(kinds(rooms)[7]).toBe('mine');
		expect(kinds(rooms)[1]).toBe('idle');
		const sealed = match({}, {sealedRoom: 8, sealedTurn: 1, turn: 2});
		const s = shipView({match: sealed, me: at(7), mode: 'move'});
		expect(pickable(s)).toEqual([4, 5, 6]);
		expect(kinds(shipView({match: sealed, me: at(2), mode: 'none'}))[8]).toBe(
			'sealed',
		);
		expect(sealedNow(sealed)).toBe(8);
		expect(sealedNow(match({}, {sealedRoom: 8, sealedTurn: 1, turn: 3}))).toBe(
			undefined,
		);
	});

	it('offers the rooms in sight to shoot, its own included', () => {
		expect(pickable(shipView({me: at(4), mode: 'shoot'}))).toEqual([
			2, 4, 5, 6, 7,
		]);
	});

	it('offers traps to detonate or replace, and any other room for the charge', () => {
		const me = at(8, [3, 6]);
		expect(pickable(shipView({me, mode: 'detonate'}))).toEqual([3, 6]);
		expect(pickable(shipView({me, mode: 'replace'}))).toEqual([3, 6]);
		expect(pickable(shipView({me, mode: 'charge'}))).toEqual([
			1, 2, 3, 4, 5, 6, 7,
		]);
		const k = kinds(shipView({me: at(1, [3, 0], 6), mode: 'none'}));
		expect([k[1], k[3], k[6]]).toEqual(['mine', 'trap', 'charged']);
	});

	it('offers the answers a listen allows, and the way out of a purge', () => {
		const listen = match({awaiting: 2}, {phase: PHASE.LISTEN});
		const role = roleIn(listen, B, 0);
		expect(pickModeFor(listen, role, 'move', at(7))).toBe('reveal');
		expect(
			pickable(shipView({match: listen, me: at(7), mode: 'reveal'})),
		).toEqual([4, 5, 6, 8]);
		const tracker = match({awaiting: 2}, {phase: PHASE.TRACKER});
		expect(pickModeFor(tracker, roleIn(tracker, B, 0), 'move', at(2))).toBe(
			'none',
		);
		expect(pickModeFor(tracker, roleIn(tracker, B, 0), 'move', at(6))).toBe(
			'reveal',
		);
		const purge = match(
			{awaiting: 2},
			{phase: PHASE.PURGE, sealedRoom: 8, sealedTurn: 1},
		);
		expect(pickModeFor(purge, roleIn(purge, B, 0), 'move', at(8))).toBe('flee');
		expect(pickable(shipView({match: purge, me: at(8), mode: 'flee'}))).toEqual(
			[3, 6, 7],
		);
		expect(pickModeFor(purge, roleIn(purge, B, 0), 'move', at(6))).toBe('none');
	});

	it('offers every room to start in, and marks the one picked', () => {
		const rooms = shipView({me: undefined, mode: 'start', selected: 3});
		expect(pickable(rooms)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
		expect(rooms.find((r) => r.selected)?.room).toBe(3);
	});

	it("shows the opponent's revealed room, the room targeted, and where they were seen", () => {
		const k = kinds(
			shipView({
				me: at(7),
				mode: 'none',
				query: {from: 4, into: 7, byMe: false},
			}),
		);
		expect([k[4], k[7]]).toEqual(['revealed', 'mine']);
		const own = kinds(
			shipView({
				me: at(4),
				mode: 'none',
				query: {from: 4, into: 6, byMe: true},
			}),
		);
		expect([own[4], own[6]]).toEqual(['mine', 'shotAt']);
		const seen = kinds(shipView({me: at(1), mode: 'none', seen: 5, near: 7}));
		expect([seen[5], seen[7]]).toEqual(['seen', 'near']);
		const purge = match({awaiting: 2}, {phase: PHASE.PURGE, argA: 1, argB: 8});
		expect(queryOf(purge, roleIn(purge, B, 0))).toEqual({
			from: 1,
			into: 8,
			byMe: false,
		});
		expect(queryOf(match(), roleIn(match(), A, 0))).toBe(undefined);
	});

	it('picks by intent, and forces the move after a shot', () => {
		const m = match();
		expect(pickModeFor(m, roleIn(m, A, 0), 'shoot', at(1))).toBe('shoot');
		const one = match({}, {ap: 1});
		expect(pickModeFor(one, roleIn(one, A, 0), 'shoot', at(1))).toBe('none');
		expect(pickModeFor(one, roleIn(one, A, 0), 'move', at(1))).toBe('move');
		const after = match({}, {phase: PHASE.MOVE_AFTER_SHOT, ap: 0, argA: 4});
		expect(pickModeFor(after, roleIn(after, A, 0), 'shoot', at(4))).toBe(
			'move',
		);
		expect(pickModeFor(m, roleIn(m, B, 0), 'move', at(1))).toBe('none');
	});

	it('says where things stand', () => {
		const shot = match(
			{awaiting: 2},
			{phase: PHASE.SHOT, ap: 0, argA: 4, argB: 7},
		);
		expect(statusLine(shot, roleIn(shot, B, 0))).toBe(
			'Shot from the Observation Gantry into the Cargo Hold: answer it.',
		);
		expect(statusLine(match(), roleIn(match(), A, 0))).toBe(
			'Your turn: 2 action points left.',
		);
		const listen = match({awaiting: 2}, {phase: PHASE.LISTEN});
		expect(statusLine(listen, roleIn(listen, B, 0))).toBe(
			'They are listening: name a room next to yours: answer it.',
		);
		const due = match({}, {armed: 1, turn: 3, acted: 1});
		expect(statusLine(due, roleIn(due, A, 0))).toBe(
			'Your Remote Charge goes off before anything else.',
		);
		expect(gearLine(at(2, [3, 0], 6))).toBe(
			'Your traps: the Science Lab. Your Remote Charge is in the Mess Hall.',
		);
	});
});

describe('the history', () => {
	const ev = (
		seat: number,
		last: number,
		phase: number,
		argA = 0,
		argB = 0,
		hits: [number, number] = [0, 0],
	): ActedEvent => ({seat, last, phase, argA, argB, hits});

	it('reads each event against the one before it', () => {
		const h = historyOf([
			ev(0, ACTION.SHOOT, PHASE.SHOT, 4, 7),
			ev(1, ACTION.ANSWER, PHASE.MOVE_AFTER_SHOT, 4, 7, [0, 1]),
			ev(0, ACTION.FORCED_MOVE, PHASE.PLAY),
			ev(1, ACTION.LISTEN, PHASE.LISTEN, 0, 0, [0, 1]),
			ev(0, ACTION.ANSWER, PHASE.PLAY, 0, 2, [0, 1]),
			ev(1, ACTION.DETONATE, PHASE.DETONATION, 0, 5, [0, 1]),
			ev(0, ACTION.ANSWER, PHASE.PLAY, 0, 5, [0, 1]),
		]);
		expect(h.map((e) => describeEntry(e, 0))).toEqual([
			'You shot from the Observation Gantry into the Cargo Hold.',
			'They were hit in the Cargo Hold.',
			'You slipped out of the room your shot gave away.',
			'They listened.',
			'You named the Bridge, next to your room.',
			'They set off a trap in the Galley.',
			'A miss.',
		]);
		expect(h[1]).toMatchObject({asked: PHASE.SHOT, hitSeat: 1});
	});

	it('words the room effects and their answers', () => {
		const h = historyOf([
			ev(1, ACTION.COOLANT_PURGE, PHASE.PURGE, 1, 8),
			ev(0, ACTION.ANSWER, PHASE.PLAY, 1, 8, [1, 0]),
			ev(1, ACTION.MOTION_TRACKER, PHASE.TRACKER, 7),
			ev(0, ACTION.ANSWER, PHASE.PLAY, 1, 3, [1, 0]),
			ev(1, ACTION.STIM_RATIONS, PHASE.PLAY, 5),
		]);
		expect(h.map((e) => describeEntry(e, 0))).toEqual([
			'They purged the Engine Room from the Cryo Bay: it is sealed.',
			'You were caught in the Engine Room: hit, and slipped out.',
			'They used the Motion Tracker in the Cargo Hold.',
			'The tracker found you in the Science Lab.',
			'They took Stim Rations in the Galley: 3 action points.',
		]);
	});

	it('remembers where the opponent was last seen, and how much it has moved since', () => {
		const shot = [
			ev(1, ACTION.SHOOT, PHASE.SHOT, 4, 7),
			ev(0, ACTION.ANSWER, PHASE.MOVE_AFTER_SHOT, 4, 7),
		];
		expect(sightingOf(historyOf(shot), 0)).toEqual({room: 4, movesSince: 0});
		const moved = historyOf([...shot, ev(1, ACTION.FORCED_MOVE, PHASE.PLAY)]);
		expect(sightingOf(moved, 0)).toMatchObject({room: 4, movesSince: 1});
		expect(sightingLine(sightingOf(moved, 0))).toBe(
			'They were last seen in the Observation Gantry, 1 move ago.',
		);
		const heard = historyOf([
			ev(0, ACTION.LISTEN, PHASE.LISTEN),
			ev(1, ACTION.ANSWER, PHASE.PLAY, 0, 6),
		]);
		expect(sightingOf(heard, 0)).toEqual({movesSince: 0, near: 6});
		const trapped = historyOf([
			ev(0, ACTION.DETONATE, PHASE.DETONATION, 0, 5),
			ev(1, ACTION.ANSWER, PHASE.PLAY, 0, 5, [0, 1]),
		]);
		expect(sightingOf(trapped, 0)).toEqual({room: 5, movesSince: 0});
		const purged = historyOf([
			ev(0, ACTION.COOLANT_PURGE, PHASE.PURGE, 1, 8),
			ev(1, ACTION.ANSWER, PHASE.PLAY, 1, 8, [0, 1]),
		]);
		expect(sightingOf(purged, 0)).toEqual({room: 8, movesSince: 1});
		expect(sightingOf(purged, 1)).toEqual({room: 1, movesSince: 0});
		expect(sightingLine({movesSince: 0})).toBe(undefined);
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

describe('the turn limit', () => {
	it('counts turns, and says whose last turn it is', () => {
		const line = (turn: number, actor: number, who: string) => {
			const m = match({}, {turn, actor});
			return turnLine(m, roleIn(m, who, 0));
		};
		expect(line(7, 0, A)).toBe('Turn 7 of 30.');
		expect(line(28, 1, B)).toBe('Turn 28 of 30.');
		expect(line(29, 0, A)).toBe('Turn 29 of 30: your last turn.');
		expect(line(29, 0, B)).toBe(
			'Turn 29 of 30: their last turn. You have one more.',
		);
		expect(line(30, 1, B)).toBe(
			'Turn 30 of 30: your last turn. The match ends with it: fewer hits taken wins.',
		);
		expect(line(30, 1, A)).toBe(
			'Turn 30 of 30: their last turn. The match ends with it: fewer hits taken wins.',
		);
		const unlimited = match({maxTurns: 0}, {turn: 99});
		expect(turnLine(unlimited, roleIn(unlimited, A, 0))).toBe('Turn 99.');
	});

	it('labels a Remote Charge that would never go off', () => {
		const can = (turn: number) => {
			const m = match({}, {turn, actor: 0, acted: turn});
			return actionsFor(m, roleIn(m, A, 0), at(8));
		};
		expect([can(28).remoteCharge, can(28).chargeNeverGoesOff]).toEqual([
			true,
			false,
		]);
		expect([can(29).remoteCharge, can(29).chargeNeverGoesOff]).toEqual([
			true,
			true,
		]);
	});

	it('tells each way a match ends, from both sides', () => {
		const done = (
			winner: number,
			hits: [number, number],
			phase: number,
			ending?: {winner: number; byTimeout: boolean},
		) => {
			const m = match({status: 'Finished', winner}, {hits, phase, turn: 30});
			return [A, B].map((p) => resultLine(m, roleIn(m, p, 0), ending));
		};
		expect(done(0, [0, 2], PHASE.OVER)).toEqual([
			'You won: two hits.',
			'You lost: two hits.',
		]);
		expect(done(0, [0, 1], PHASE.PLAY, {winner: 0, byTimeout: false})).toEqual([
			'You won on hits at the turn limit: they took 1, you 0.',
			'You lost on hits at the turn limit: you took 1, they 0.',
		]);
		expect(done(1, [0, 1], PHASE.SHOT, {winner: 1, byTimeout: true})).toEqual([
			'You lost: you ran out of time.',
			'You won: they ran out of time.',
		]);
		expect(
			done(NO_WINNER, [1, 1], PHASE.PLAY, {
				winner: NO_WINNER,
				byTimeout: false,
			}),
		).toEqual([
			'A tie at the turn limit (1 to 1 hits): both stakes refunded.',
			'A tie at the turn limit (1 to 1 hits): both stakes refunded.',
		]);
		// before the event is read, a win at the limit is still a win
		expect(done(0, [0, 1], PHASE.PLAY)).toEqual([
			'You won the pot.',
			'You lost.',
		]);
	});

	it('never reads a draw as a loss', () => {
		const m = match({status: 'Finished', winner: NO_WINNER});
		for (const p of [A, B]) {
			const r = roleIn(m, p, 0);
			expect([r.drawn, r.won, r.lost]).toEqual([true, false, false]);
			expect(statusLine(m, r)).toContain('A tie');
		}
	});
});
