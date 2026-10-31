import {
	answerOptions,
	canMove,
	canShoot,
	chargeDue,
	freshTurn,
	isArmed,
	isQuery,
	roomSealed,
	sealActive,
	CARGO_HOLD,
	CRYO_BAY,
	ENGINE_ROOM,
	GALLEY,
	GANTRY,
	LIVES,
	MOVES,
	PHASE,
	ROOMS,
	ROOM_NAMES,
	SCIENCE_LAB,
	SHOTS,
	type Hidden,
	type Room,
} from 'duel-in-the-dark-circuits/duel';
import type {MatchSummary} from '$lib/duel/state';

/**
 * Everything the page asks about one match from one player's point of view,
 * worked out here so that the components only render. Pure: the same match,
 * player and time always give the same answer.
 */
export type MatchRole = {
	seat: number | undefined;
	/** an open match this player could join */
	canJoin: boolean;
	/** the creator of an open match, who can still cancel it */
	canCancel: boolean;
	/** this player may spend action points or end the turn */
	myTurn: boolean;
	/** this player's Remote Charge must go off before anything else */
	mustFireCharge: boolean;
	/** this player shot and now owes the free move out of the revealed room */
	mustMoveAfterShot: boolean;
	/** the opponent asked something and this player owes a proven answer */
	mustAnswer: boolean;
	/** waiting on the opponent to answer this player's query */
	waitingForAnswer: boolean;
	/** the deadline passed: anyone may end the match (the waited-for side loses) */
	timedOut: boolean;
	won: boolean;
	lost: boolean;
	secondsLeft: number;
	/** hits each side has taken, from this player's point of view */
	myHits: number;
	theirHits: number;
	/** a shot in progress: where it came from and where it went */
	shot?: {from: number; into: number; byMe: boolean};
};

export function seatOf(match: MatchSummary, player: string | undefined) {
	if (!player) return undefined;
	const i = match.seats.findIndex(
		(s) => s.player.toLowerCase() === player.toLowerCase(),
	);
	return i < 0 ? undefined : i;
}

export function roleIn(
	match: MatchSummary,
	player: string | undefined,
	nowSeconds: number,
): MatchRole {
	const mine = seatOf(match, player);
	const b = match.board;
	const active = match.status === 'Active';
	const timedOut = active && nowSeconds > match.deadline;
	const live = active && !timedOut;
	const actorIsMe = mine !== undefined && mine === b.actor;
	const responderIsMe = mine !== undefined && mine !== b.actor;
	const shotPending =
		active && (b.phase === PHASE.SHOT || b.phase === PHASE.MOVE_AFTER_SHOT);
	const due = chargeDue(b);
	return {
		seat: mine,
		canJoin:
			match.status === 'Open' && player !== undefined && mine === undefined,
		canCancel: match.status === 'Open' && mine === 0,
		myTurn: live && actorIsMe && b.phase === PHASE.PLAY && !due,
		mustFireCharge: live && actorIsMe && b.phase === PHASE.PLAY && due,
		mustMoveAfterShot: live && actorIsMe && b.phase === PHASE.MOVE_AFTER_SHOT,
		mustAnswer: live && responderIsMe && isQuery(b.phase),
		waitingForAnswer: active && actorIsMe && isQuery(b.phase),
		timedOut,
		won: match.status === 'Finished' && mine === match.winner,
		lost:
			match.status === 'Finished' &&
			mine !== undefined &&
			mine !== match.winner,
		secondsLeft: Math.max(0, match.deadline - nowSeconds),
		myHits: mine === undefined ? 0 : b.hits[mine],
		theirHits: mine === undefined ? 0 : b.hits[1 - mine],
		...(shotPending
			? {shot: {from: b.argA, into: b.argB, byMe: actorIsMe}}
			: {}),
	};
}

export {LIVES, ROOM_NAMES};

// ----------------------------------------------------------------------------
// WHAT THE TURN HOLDER MAY DO
// ----------------------------------------------------------------------------

export type Actions = {
	move: boolean;
	shoot: boolean;
	listen: boolean;
	setTrap: boolean;
	/** both traps are set: setting one means choosing which it replaces */
	setTrapReplaces: boolean;
	detonate: boolean;
	remoteCharge: boolean;
	dropDown: boolean;
	coolantPurge: boolean;
	maintenanceChute: boolean;
	stimRations: boolean;
	motionTracker: boolean;
};

const NOTHING: Actions = {
	move: false,
	shoot: false,
	listen: false,
	setTrap: false,
	setTrapReplaces: false,
	detonate: false,
	remoteCharge: false,
	dropDown: false,
	coolantPurge: false,
	maintenanceChute: false,
	stimRations: false,
	motionTracker: false,
};

/**
 * The actions the rules allow the turn holder right now, given its hidden
 * state (`me`, from this browser's secret). The circuits decide; this only
 * keeps the page from offering what would not prove.
 */
export function actionsFor(
	match: MatchSummary,
	role: MatchRole,
	me: Hidden | undefined,
): Actions {
	if (!role.myTurn || !me) return NOTHING;
	const b = match.board;
	const ap = b.ap;
	const here = me.room;
	const trapped = me.traps.filter((t) => t !== 0);
	return {
		move: ap >= 1,
		shoot: ap >= 2,
		listen: ap >= 1,
		setTrap: ap >= 1 && !me.traps.includes(here),
		setTrapReplaces: trapped.length === 2,
		detonate: ap >= 1 && trapped.length > 0,
		remoteCharge:
			ap >= 1 &&
			here === ENGINE_ROOM &&
			me.charge === 0 &&
			!isArmed(b, b.actor),
		dropDown: here === GANTRY,
		coolantPurge: ap >= 1 && here === CRYO_BAY,
		maintenanceChute: ap >= 1 && here === SCIENCE_LAB,
		stimRations: here === GALLEY && freshTurn(b),
		motionTracker: here === CARGO_HOLD && b.tracked !== b.turn,
	};
}

// ----------------------------------------------------------------------------
// THE SHIP, as the page draws it
// ----------------------------------------------------------------------------

/**
 * What the player is choosing a room FOR: a starting room (any), a move, a
 * shot, a trap to detonate, a Remote Charge's room, the trap a new one
 * replaces, the room a listen answer names, the room to flee to after a hit
 * in the Engine Room, or nothing.
 */
export type PickMode =
	| 'start'
	| 'move'
	| 'shoot'
	| 'detonate'
	| 'charge'
	| 'replace'
	| 'reveal'
	| 'flee'
	| 'none';

/** What the player can choose to do by clicking rooms, during its turn. */
export type Intent = 'move' | 'shoot' | 'detonate' | 'charge' | 'replace';

export type RoomKind =
	| Exclude<PickMode, 'none'>
	| 'mine'
	| 'revealed'
	| 'shotAt'
	| 'seen'
	| 'near'
	| 'trap'
	| 'charged'
	| 'sealed'
	| 'idle';

export type RoomView = {
	room: Room;
	name: string;
	kind: RoomKind;
	/** clicking it does something */
	pickable: boolean;
	selected: boolean;
};

/** The rooms a pick mode offers. */
export function pickableRooms(
	mode: PickMode,
	match: MatchSummary | undefined,
	me: Hidden | undefined,
): number[] {
	const b = match?.board;
	const here = me?.room;
	switch (mode) {
		case 'start':
			return [...ROOMS];
		case 'move':
			return here === undefined
				? []
				: ROOMS.filter((r) => canMove(here, r) && !(b && roomSealed(b, r)));
		case 'shoot':
			return here === undefined ? [] : ROOMS.filter((r) => canShoot(here, r));
		case 'detonate':
		case 'replace':
			return me ? me.traps.filter((t) => t !== 0) : [];
		case 'charge':
			return ROOMS.filter((r) => r !== ENGINE_ROOM);
		case 'reveal':
		case 'flee': {
			if (!b || here === undefined) return [];
			const o = answerOptions(b, here);
			return o.kind === 'none' ? [] : o.rooms;
		}
		default:
			return [];
	}
}

/**
 * How each room looks. `me` is this player's hidden state (from this
 * browser's secret), `query` the action in progress (the room it revealed,
 * the room it targets), `seen` and `near` where the opponent was last known
 * to be, `selected` a room the player picked.
 */
export function shipView(params: {
	match?: MatchSummary;
	me: Hidden | undefined;
	mode: PickMode;
	query?: {from: number; into: number; byMe: boolean};
	seen?: number;
	near?: number;
	selected?: number;
}): RoomView[] {
	const {match, me, mode, query, seen, near, selected} = params;
	const pickable = new Set(pickableRooms(mode, match, me));
	const b = match?.board;
	return ROOMS.map((room) => {
		let kind: RoomKind = 'idle';
		if (room === me?.room) kind = 'mine';
		else if (pickable.has(room)) kind = mode as RoomKind;
		else if (query && !query.byMe && room === query.from) kind = 'revealed';
		else if (query && room === query.into) kind = 'shotAt';
		else if (room === seen) kind = 'seen';
		else if (room === near) kind = 'near';
		else if (me?.traps.includes(room)) kind = 'trap';
		else if (me?.charge === room) kind = 'charged';
		else if (b && roomSealed(b, room)) kind = 'sealed';
		return {
			room,
			name: ROOM_NAMES[room],
			kind,
			pickable: pickable.has(room),
			selected: selected === room,
		};
	});
}

/** The rooms reachable from `room`, by moving and by shooting, for the legend. */
export function reachFrom(room: number | undefined) {
	if (room === undefined || !(room in MOVES)) return {moves: [], shots: []};
	return {
		moves: MOVES[room as Room].map((r) => ROOM_NAMES[r]),
		shots: SHOTS[room as Room].map((r) => ROOM_NAMES[r]),
	};
}

/** What clicking a room does in a match, given what the player chose to do. */
export function pickModeFor(
	match: MatchSummary,
	role: MatchRole,
	intent: Intent,
	me: Hidden | undefined,
): PickMode {
	if (role.mustMoveAfterShot) return 'move';
	if (role.mustAnswer) {
		if (me === undefined) return 'none';
		const o = answerOptions(match.board, me.room);
		return o.kind === 'reveal' ? 'reveal' : o.kind === 'flee' ? 'flee' : 'none';
	}
	const can = actionsFor(match, role, me);
	switch (intent) {
		case 'move':
			return can.move ? 'move' : 'none';
		case 'shoot':
			return can.shoot ? 'shoot' : 'none';
		case 'detonate':
			return can.detonate ? 'detonate' : 'none';
		case 'charge':
			return can.remoteCharge ? 'charge' : 'none';
		case 'replace':
			return can.setTrap && can.setTrapReplaces ? 'replace' : 'none';
	}
}

/**
 * The action in progress, for the ship: the room it revealed (`from`, 0 if
 * none) and the room it targets (`into`, 0 if none).
 */
export function queryOf(
	match: MatchSummary,
	role: MatchRole,
): {from: number; into: number; byMe: boolean} | undefined {
	const b = match.board;
	if (match.status !== 'Active') return undefined;
	if (!isQuery(b.phase) && b.phase !== PHASE.MOVE_AFTER_SHOT) return undefined;
	if (b.phase === PHASE.LISTEN) return undefined;
	return {from: b.argA, into: b.argB, byMe: role.seat === b.actor};
}

/** The room sealed right now, if any. */
export function sealedNow(match: MatchSummary): number | undefined {
	return sealActive(match.board) ? match.board.sealedRoom : undefined;
}

const QUERY_ASKS: Record<number, (b: MatchSummary['board']) => string> = {
	[PHASE.SHOT]: (b) => `Shot from ${roomName(b.argA)} into ${roomName(b.argB)}`,
	[PHASE.LISTEN]: () => 'They are listening: name a room next to yours',
	[PHASE.DETONATION]: (b) => `A trap went off in ${roomName(b.argB)}`,
	[PHASE.CHARGE]: (b) => `A Remote Charge went off in ${roomName(b.argB)}`,
	[PHASE.PURGE]: () => 'The Engine Room is being purged',
	[PHASE.CHUTE]: () => 'The Maintenance Chute opened under the Galley',
	[PHASE.TRACKER]: () => 'A Motion Tracker is sweeping the ship',
};

function roomName(room: number) {
	return `the ${ROOM_NAMES[room as Room] ?? `room ${room}`}`;
}

/** One sentence: where the match stands for this player. */
export function statusLine(match: MatchSummary, role: MatchRole): string {
	const b = match.board;
	if (match.status === 'Open')
		return role.canCancel ? 'Waiting for an opponent.' : 'Open: join it.';
	if (match.status === 'Cancelled') return 'Cancelled.';
	if (match.status === 'Finished')
		return role.won
			? 'You won the pot.'
			: role.lost
				? 'You lost.'
				: `Seat ${match.winner} won.`;
	if (role.timedOut) return 'The deadline passed.';
	if (role.mustAnswer)
		return `${QUERY_ASKS[b.phase]?.(b) ?? 'A query'}: answer it.`;
	if (role.waitingForAnswer) return 'Waiting for their answer.';
	if (role.mustFireCharge)
		return 'Your Remote Charge goes off before anything else.';
	if (role.mustMoveAfterShot)
		return 'Your shot gave you away: move out of the room (free).';
	if (role.myTurn)
		return `Your turn: ${b.ap} action point${b.ap === 1 ? '' : 's'} left.`;
	if (role.shot && !role.shot.byMe)
		return `Your opponent shot from ${roomName(role.shot.from)} and is about to move.`;
	return "Your opponent's turn.";
}

/** What this player's hidden state holds besides its room, in words. */
export function gearLine(me: Hidden | undefined): string {
	if (!me) return '';
	const traps = me.traps.filter((t) => t !== 0).map(roomName);
	const parts = [
		traps.length ? `Your traps: ${traps.join(', ')}.` : 'No trap set.',
	];
	if (me.charge !== 0)
		parts.push(`Your Remote Charge is in ${roomName(me.charge)}.`);
	return parts.join(' ');
}
