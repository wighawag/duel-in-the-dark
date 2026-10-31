import {
	canMove,
	canShoot,
	LIVES,
	MOVES,
	PHASE,
	ROOMS,
	ROOM_NAMES,
	SHOTS,
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
	/** this player may spend action points (move, shoot) or end the turn */
	myTurn: boolean;
	/** this player shot and now owes the free move out of `revealedRoom` */
	mustMoveAfterShot: boolean;
	/** the opponent shot and this player owes a proven answer */
	mustAnswer: boolean;
	/** waiting on the opponent to answer this player's shot */
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
	return {
		seat: mine,
		canJoin:
			match.status === 'Open' && player !== undefined && mine === undefined,
		canCancel: match.status === 'Open' && mine === 0,
		myTurn: live && actorIsMe && b.phase === PHASE.PLAY,
		mustMoveAfterShot: live && actorIsMe && b.phase === PHASE.MOVE_AFTER_SHOT,
		mustAnswer: live && responderIsMe && b.phase === PHASE.SHOT,
		waitingForAnswer: active && actorIsMe && b.phase === PHASE.SHOT,
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
// THE SHIP, as the page draws it
// ----------------------------------------------------------------------------

/**
 * What the player is choosing a room FOR: a starting room (any), a move (an
 * adjacent room), a shot (a room the current one sees), or nothing.
 */
export type PickMode = 'start' | 'move' | 'shoot' | 'none';

export type RoomKind =
	'mine' | 'move' | 'shoot' | 'start' | 'revealed' | 'shotAt' | 'idle';

export type RoomView = {
	room: Room;
	name: string;
	kind: RoomKind;
	/** clicking it does something */
	pickable: boolean;
	selected: boolean;
};

/**
 * How each room looks. `myRoom` is this player's hidden room (from this
 * browser's secret), `shot` the shot in progress (the revealed room it came
 * from, the room it went into), `selected` a room the player picked.
 */
export function shipView(params: {
	myRoom: number | undefined;
	mode: PickMode;
	shot?: {from: number; into: number; byMe: boolean};
	selected?: number;
}): RoomView[] {
	const {myRoom, mode, shot, selected} = params;
	return ROOMS.map((room) => {
		const pickable =
			mode === 'start' ||
			(mode === 'move' && myRoom !== undefined && canMove(myRoom, room)) ||
			(mode === 'shoot' && myRoom !== undefined && canShoot(myRoom, room));
		let kind: RoomKind = 'idle';
		if (room === myRoom) kind = 'mine';
		else if (pickable) kind = mode as 'start' | 'move' | 'shoot';
		else if (shot && !shot.byMe && room === shot.from) kind = 'revealed';
		else if (shot && room === shot.into) kind = 'shotAt';
		return {
			room,
			name: ROOM_NAMES[room],
			kind,
			pickable,
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
	intent: 'move' | 'shoot',
): PickMode {
	if (role.mustMoveAfterShot) return 'move';
	if (!role.myTurn) return 'none';
	if (intent === 'shoot') return match.board.ap >= 2 ? 'shoot' : 'none';
	return match.board.ap >= 1 ? 'move' : 'none';
}

/** One sentence: where the match stands for this player. */
export function statusLine(match: MatchSummary, role: MatchRole): string {
	const name = (room: number) => ROOM_NAMES[room as Room] ?? `room ${room}`;
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
	if (role.mustAnswer && role.shot)
		return `Shot from the ${name(role.shot.from)} into the ${name(role.shot.into)}: answer it.`;
	if (role.waitingForAnswer && role.shot)
		return `You shot into the ${name(role.shot.into)}: waiting for the answer.`;
	if (role.mustMoveAfterShot)
		return 'Your shot gave you away: move out of the room (free).';
	if (role.myTurn)
		return `Your turn: ${match.board.ap} action point${match.board.ap === 1 ? '' : 's'} left.`;
	if (role.shot && !role.shot.byMe)
		return `Your opponent shot from the ${name(role.shot.from)} and is about to move.`;
	return "Your opponent's turn.";
}
